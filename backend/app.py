from __future__ import annotations

from datetime import date
from pathlib import Path
from uuid import uuid4

import pypdfium2 as pdfium
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import Image

try:
    from .db import connect, init_db
    from .ocr import ModelUnavailable, clean_page, transcribe
except ImportError:  # Supports `python backend/app.py` as well as module imports.
    from db import connect, init_db
    from ocr import ModelUnavailable, clean_page, transcribe

ROOT = Path(__file__).parent
UPLOADS = ROOT / "uploads"
UPLOADS.mkdir(exist_ok=True)
app = Flask(__name__)
CORS(app)
init_db()


def pages_from_upload(upload):
    if upload.filename.lower().endswith(".pdf") or upload.mimetype == "application/pdf":
        try:
            doc = pdfium.PdfDocument(upload.stream.read())
        except pdfium.PdfiumError:
            return None
        return [page.render(scale=200 / 72).to_pil() for page in doc]
    try:
        return [Image.open(upload.stream)]
    except OSError:
        return None


def note_row(row):
    note = dict(row)
    with connect() as db:
        note["blocks"] = [dict(block) for block in db.execute("SELECT id, content, block_order FROM blocks WHERE note_id=? ORDER BY block_order", (note["id"],))]
    return note


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/notes")
def notes():
    subject, topic, scan_date = request.args.get("subject", ""), request.args.get("topic", ""), request.args.get("scan_date", "")
    query = "SELECT * FROM notes WHERE subject LIKE ? AND topic LIKE ? AND scan_date LIKE ? ORDER BY scan_date DESC, id DESC"
    with connect() as db:
        rows = db.execute(query, (f"%{subject}%", f"%{topic}%", f"%{scan_date}%")).fetchall()
    return jsonify([note_row(row) for row in rows])


@app.post("/notes")
def create_note():
    upload = request.files.get("scan")
    if not upload or not upload.filename:
        return {"error": "Attach a scan image or PDF."}, 400
    pages = pages_from_upload(upload)
    if not pages:
        return {"error": "The upload must be an image or PDF."}, 400
    title = request.form.get("title")
    scan_date = request.form.get("scan_date") or date.today().isoformat()
    subject, topic = request.form.get("subject", ""), request.form.get("topic", "")
    created_ids = []
    for index, page in enumerate(pages):
        image = clean_page(page)
        filename = f"{uuid4().hex}.png"
        image.save(UPLOADS / filename)
        try:
            lines = transcribe(image)
        except ModelUnavailable as exc:
            (UPLOADS / filename).unlink(missing_ok=True)
            if not created_ids:
                return {"error": str(exc)}, 503
            break  # keep the pages already saved; stop scanning the rest of this PDF
        page_title = title or (lines[0][:60] if lines else "Untitled note")
        offset = index * 40  # stagger multi-page PDFs so pages don't stack exactly on top of each other
        with connect() as db:
            cursor = db.execute("INSERT INTO notes(title, scan_date, subject, topic, image_path, canvas_x, canvas_y) VALUES(?,?,?,?,?,?,?)", (page_title, scan_date, subject, topic, filename, 80 + offset, 80 + offset))
            note_id = cursor.lastrowid
            db.executemany("INSERT INTO blocks(note_id, content, block_order) VALUES(?,?,?)", [(note_id, line, index) for index, line in enumerate(lines)])
        created_ids.append(note_id)
    if not created_ids:
        return {"error": "No pages could be processed."}, 503
    with connect() as db:
        rows = [db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone() for note_id in created_ids]
    return jsonify([note_row(row) for row in rows]), 201


@app.patch("/notes/<int:note_id>")
def update_note(note_id):
    payload = request.get_json() or {}
    allowed = {key: payload[key] for key in ("title", "scan_date", "subject", "topic", "canvas_x", "canvas_y") if key in payload}
    if not allowed:
        return {"error": "No editable fields supplied."}, 400
    sets = ", ".join(f"{key}=?" for key in allowed)
    with connect() as db:
        db.execute(f"UPDATE notes SET {sets} WHERE id=?", (*allowed.values(), note_id))
        row = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    return jsonify(note_row(row)) if row else ({"error": "Note not found."}, 404)


@app.patch("/blocks/<int:block_id>")
def update_block(block_id):
    content = (request.get_json() or {}).get("content", "").strip()
    if not content:
        return {"error": "Text cannot be empty."}, 400
    with connect() as db:
        db.execute("UPDATE blocks SET content=? WHERE id=?", (content, block_id))
    return {"ok": True}


@app.get("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(UPLOADS, filename)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
