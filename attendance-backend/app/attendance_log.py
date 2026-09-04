"""SQLite-backed attendance log."""
import sqlite3
from datetime import datetime, timezone

DB_PATH = "./data/attendance.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            name TEXT,
            similarity REAL NOT NULL,
            timestamp TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def mark_attendance(code: str, name: str, similarity: float) -> str:
    conn = sqlite3.connect(DB_PATH)
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO attendance (code, name, similarity, timestamp) VALUES (?, ?, ?, ?)",
        (code, name, similarity, ts),
    )
    conn.commit()
    conn.close()
    return ts


def get_recent_attendance(limit: int = 50):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, code, name, similarity, timestamp FROM attendance ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "similarity": row["similarity"],
            "timestamp": row["timestamp"],
        }
        for row in rows
    ]

