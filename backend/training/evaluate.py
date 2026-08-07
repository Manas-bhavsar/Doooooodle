"""Report held-out CER/WER for the fine-tuned TrOCR model."""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import jiwer
import pandas as pd
import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

ROOT = Path(__file__).parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    frame = pd.read_csv(args.manifest).dropna(subset=["image", "text"])
    path = ROOT / "models" / "trocr-custom"
    processor = TrOCRProcessor.from_pretrained(str(path))
    model = VisionEncoderDecoderModel.from_pretrained(str(path))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()
    predictions = []
    for row in frame.to_dict("records"):
        pixels = processor(Image.open(row["image"]).convert("RGB"), return_tensors="pt").pixel_values.to(device)
        with torch.inference_mode(): tokens = model.generate(pixels, max_new_tokens=96)
        predictions.append(processor.batch_decode(tokens, skip_special_tokens=True)[0])
    report = {"evaluated_at": datetime.now().isoformat(), "samples": len(frame), "cer": jiwer.cer(frame.text.tolist(), predictions), "wer": jiwer.wer(frame.text.tolist(), predictions), "device": device, "examples": [{"truth": truth, "prediction": predicted} for truth, predicted in zip(frame.text.head(10), predictions[:10])]}
    reports = ROOT / "reports"; reports.mkdir(exist_ok=True)
    (reports / "evaluation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
