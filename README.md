# Doooodle

Local-first web app that converts scanned English handwritten notes into editable blocks on a date-organized infinite canvas.

## Run

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-gpu.txt
python backend\app.py
```

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Files and SQLite data remain in `backend/data/` and `backend/uploads/`.

## Handwriting model

The API loads `backend/models/trocr-custom/` if present, falling back to the pretrained
`microsoft/trocr-small-handwritten` checkpoint otherwise. Both are TrOCR fine-tuned on IAM
(a standard multi-writer English handwriting benchmark, ~500 writers) so accuracy generalizes
across handwriting styles rather than being tuned to one person.

| model | CER | WER |
| --- | ---: | ---: |
| pretrained checkpoint (Microsoft's own fine-tune) | 6.33% | 14.27% |
| `train.py --iam` retrain, loss bugs fixed (this repo's custom model) | **4.79%** | **11.52%** |

Measured on the full IAM held-out test split (2,915 lines), see `backend/reports/evaluation-v4-fixed-loss-iam-finetune.json`.

Getting here took fixing three real, compounding bugs in `train.py` (see comments in the file and
`backend/reports/evaluation-v*.json` for the debugging trail: earlier broken attempts scored as
badly as 54% CER):
1. `model.config.decoder_start_token_id` was set for training but never synced to
   `model.generation_config` (what `.generate()` actually reads) - the model trained on one start
   token and generated from another it had never seen.
2. The tokenizer auto-wraps every label as `[bos, ...tokens, eos]`, but `decoder_start_token_id`
   already takes the bos's role for this model - the extra bos silently shifted every label one
   position out of alignment.
3. This transformers version's automatic loss for `VisionEncoderDecoderModel` routes to
   `ForCausalLMLoss` (a decoder-only loss that re-shifts labels internally), double-misaligning
   labels that are already externally shifted. Verified empirically: feeding the model its own
   perfect greedy output back as "labels" reported built-in loss ~26 (near-random) when manual
   cross-entropy on the identical logits was ~0.02. `train.py` now computes loss manually.

Retrain (or adapt to your own handwriting once you have a labelled manifest - see
`backend/training/DATASET_PROTOCOL.md`) with:

```powershell
python backend\training\train.py --iam
python backend\training\train.py --manifest backend\data\my_notes_manifest.csv
python backend\training\evaluate.py --manifest backend\data\heldout_notes.csv
```

A manifest has two columns: `image,text`. Keep writers in the held-out manifest completely separate
from training. `train.py`'s defaults (low learning rate, few epochs) are gentle since this checkpoint
is already well fine-tuned - the evaluation report records CER and WER, use that measured result in
the college report rather than an unverified accuracy claim.
