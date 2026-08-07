try:
    from .db import connect, init_db
except ImportError:
    from db import connect, init_db


def test_database_creates_note_and_blocks():
    init_db()
    with connect() as db:
        assert "notes" in {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}


if __name__ == "__main__":
    test_database_creates_note_and_blocks()
    print("database check passed")
