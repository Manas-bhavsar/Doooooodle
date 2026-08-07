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

## Custom handwriting model

Fine-tune the included TrOCR training pipeline before OCR use. It writes model weights to `backend/models/trocr-custom/`, which the API loads directly for every detected handwriting line.

```powershell
python backend\training\train.py --iam
python backend\training\evaluate.py --manifest backend\data\heldout_notes.csv
```

`--iam` downloads the MIT-licensed Teklia IAM-line corpus for the baseline fine-tuning run. A manifest has two columns: `image,text`. Keep writers in the held-out manifest completely separate from training. The evaluation report records CER and WER; use that measured result in the college report rather than an unverified accuracy claim.
