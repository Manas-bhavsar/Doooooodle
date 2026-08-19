from __future__ import annotations

import os

os.environ.setdefault("USE_TF", "0")  # broken/unused TF install crashes transformers' backend auto-detect

import torch  # noqa: F401  must load before paddleocr: paddleocr pulls torch in transitively via
# albumentations, and if paddle's DLL search path gets set up first, that later torch import fails
# with "WinError 127" on torch/lib/shm.dll. Importing torch here first avoids the conflict entirely.

from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


class ModelUnavailable(RuntimeError):
    pass


def clean_page(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("L")
    return ImageEnhance.Contrast(image).enhance(1.5)


BASE_MODEL = "microsoft/trocr-small-handwritten"


@lru_cache(maxsize=1)
def recognizer():
    try:
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        custom = Path(__file__).parent / "models" / "trocr-custom"
        # Fine-tune with backend/training/train.py on your own note manifests to specialize this;
        # microsoft/trocr-small-handwritten alone already scores ~6% CER on IAM (see DATASET_PROTOCOL.md
        # on why re-training it on IAM itself made accuracy worse, not better).
        source = str(custom) if custom.exists() else BASE_MODEL
        processor = TrOCRProcessor.from_pretrained(source)
        model = VisionEncoderDecoderModel.from_pretrained(source)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device).eval()
        return processor, model, device
    except Exception as exc:
        raise ModelUnavailable("Handwriting model failed to load. Install backend requirements.") from exc


@lru_cache(maxsize=1)
def detector():
    try:
        from paddleocr import PaddleOCR
        import logging
        logging.getLogger("ppocr").setLevel(logging.ERROR)
        return PaddleOCR(lang="en")
    except Exception as exc:
        raise ModelUnavailable("PaddleOCR is unavailable. Install backend requirements.") from exc


def transcribe(image: Image.Image) -> list[str]:
    import torch

    page = clean_page(image)
    found = detector().ocr(np.asarray(page.convert("RGB")), cls=True)[0] or []
    processor, model, device = recognizer()
    lines = []
    for item in found:
        points = np.asarray(item[0], dtype=int)
        left, top = points.min(axis=0)
        right, bottom = points.max(axis=0)
        crop = page.crop((left, top, right + 1, bottom + 1)).convert("RGB")
        pixels = processor(images=crop, return_tensors="pt").pixel_values.to(device)
        with torch.inference_mode():
            tokens = model.generate(pixels, max_new_tokens=96)
        text = processor.batch_decode(tokens, skip_special_tokens=True)[0].strip()
        if text:
            lines.append(text)
    return lines
