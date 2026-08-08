"""Fine-tune TrOCR on line images listed in a CSV manifest (image,text)."""
from __future__ import annotations

import os

os.environ.setdefault("USE_TF", "0")  # broken/unused TF install crashes transformers' backend auto-detect

import argparse
from pathlib import Path

import pandas as pd
import torch
from datasets import load_dataset
from PIL import Image
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    TrOCRProcessor,
    VisionEncoderDecoderModel,
)

ROOT = Path(__file__).parents[1]
BASE_MODEL = "microsoft/trocr-small-handwritten"


class LineDataset(torch.utils.data.Dataset):
    def __init__(self, rows, processor):
        self.rows, self.processor = rows, processor

    def __len__(self): return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        source = row["image"]
        image = Image.open(source).convert("RGB") if isinstance(source, str) else source.convert("RGB")
        pixels = self.processor(image, return_tensors="pt").pixel_values.squeeze(0)
        labels = self.processor.tokenizer(row["text"], padding="max_length", max_length=96, truncation=True).input_ids
        labels = [token if token != self.processor.tokenizer.pad_token_id else -100 for token in labels]
        return {"pixel_values": pixels, "labels": torch.tensor(labels)}


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--manifest", help="CSV with image,text columns")
    source.add_argument("--iam", action="store_true", help="Retrain on Teklia/IAM-line (debugging/demo only - the base checkpoint is ALREADY fine-tuned on this data and scores ~6% CER out of the box; retraining on it further only overwrites those weights with worse ones, see DATASET_PROTOCOL.md)")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--lr", type=float, default=5e-6, help="Kept low by default: this checkpoint is already well fine-tuned, so a gentle rate adapts it to new handwriting without catastrophic forgetting")
    args = parser.parse_args()
    if args.iam:
        corpus = load_dataset("Teklia/IAM-line")
        rows = list(corpus["train"])
        validation_rows = list(corpus["validation"])
    else:
        frame = pd.read_csv(args.manifest).dropna(subset=["image", "text"])
        if not {"image", "text"}.issubset(frame.columns) or len(frame) < 20:
            raise SystemExit("Manifest needs image,text columns and at least 20 line samples.")
        missing = [path for path in frame.image if not Path(path).exists()]
        if missing:
            raise SystemExit(f"Missing training image: {missing[0]}")
        rows, validation_rows = frame.to_dict("records"), None
    processor = TrOCRProcessor.from_pretrained(BASE_MODEL)
    model = VisionEncoderDecoderModel.from_pretrained(BASE_MODEL)
    # trocr-small's decoder was pretrained BART-style (decoder_start == eos, both id 2), unlike
    # trocr-base/large's RoBERTa decoder (decoder_start == cls/bos). Using cls here as "start"
    # trains the model on a start token it was never pretrained to expect, while model.generate()
    # still reads the untouched model.generation_config (decoder_start_token_id=2) at inference -
    # a silent train/inference mismatch that tanks accuracy no matter how long you train.
    # Keep the pretrained convention and set it on BOTH configs so train and generate agree.
    start_token_id = model.config.decoder.decoder_start_token_id
    model.config.decoder_start_token_id = start_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.vocab_size = model.config.decoder.vocab_size
    model.config.eos_token_id = processor.tokenizer.sep_token_id
    model.generation_config.decoder_start_token_id = start_token_id
    model.generation_config.eos_token_id = model.config.eos_token_id
    model.generation_config.pad_token_id = model.config.pad_token_id
    model.generation_config.max_new_tokens = 96
    output = ROOT / "models" / "trocr-custom"
    arguments = Seq2SeqTrainingArguments(
        output_dir=str(ROOT / "runs"), num_train_epochs=args.epochs,
        per_device_train_batch_size=4, gradient_accumulation_steps=8,
        learning_rate=args.lr, warmup_ratio=0.1, fp16=torch.cuda.is_available(), save_strategy="epoch",
        eval_strategy="epoch" if validation_rows else "no", logging_steps=10,
        save_total_limit=2, report_to="none", remove_unused_columns=False,
    )
    trainer = Seq2SeqTrainer(model=model, args=arguments, train_dataset=LineDataset(rows, processor), eval_dataset=LineDataset(validation_rows, processor) if validation_rows else None)
    trainer.train()
    trainer.save_model(str(output))
    processor.save_pretrained(str(output))
    print(f"Saved custom model to {output}")


if __name__ == "__main__":
    main()
