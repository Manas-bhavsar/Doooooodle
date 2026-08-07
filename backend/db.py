import sqlite3
from pathlib import Path

DATABASE = Path(__file__).parent / "data" / "doooodle.db"


def connect():
    DATABASE.parent.mkdir(exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY, title TEXT NOT NULL, scan_date TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT '',
          image_path TEXT NOT NULL, canvas_x REAL NOT NULL DEFAULT 80,
          canvas_y REAL NOT NULL DEFAULT 80, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS blocks (
          id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          content TEXT NOT NULL, block_order INTEGER NOT NULL
        );
        """)
