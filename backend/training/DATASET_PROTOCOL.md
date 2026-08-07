# Real-note data protocol

These PDFs are handwritten images, not labelled OCR data. A TrOCR fine-tuning
example must be a cropped text line paired with its exact transcript.

## Provisional split

| role | documents | pages | purpose |
| --- | --- | ---: | --- |
| adaptation train | `UNIT 1`, `UNIT 2`, `UNIT 4` | 36 | improve classroom-note handwriting coverage using three writers |
| validation | `UNIT 5` | 9 | choose the checkpoint without seeing test writers |
| final test | `DE - UNIT - 1` through `DE - UNIT - 4` | 221 | report per-writer and aggregate CER/WER for one fully unseen writer |
| final test | `DS UNIT-3` | 35 | report CER/WER for a second unseen writer |

The DE documents are a single writer and are held out entirely. The remaining
documents are each different writers. Never put pages from one writer in more
than one role.

## Required manifests

Create one CSV per role with `image,text` columns. `image` points to one line
crop and `text` is the human-verified transcription. The test manifest must
never be passed to `train.py`.

Do not train from PaddleOCR's own predictions: those are pseudo-labels, not
ground truth, and would make the college accuracy result misleading. Use it
only to propose line boxes, then correct their transcripts.
