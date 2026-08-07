from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


class ModelUnavailable(RuntimeError):
    pass


def clean_page(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("L")
    return ImageEnhance.Contrast(image).enhance(1.5)


@lru_cache(maxsize=1)
def recognizer():
    try:
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        path = str(Path(__file__).parent / "models" / "trocr-custom")
        processor = TrOCRProcessor.from_pretrained(path)
        model = VisionEncoderDecoderModel.from_pretrained(path)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device).eval()
        return processor, model, device
    except Exception as exc:
        raise ModelUnavailable("Custom model missing. Train it with backend/training/train.py before scanning notes.") from exc


@lru_cache(maxsize=1)
def detector():
    try:
        from paddleocr import PaddleOCR
        return PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
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
