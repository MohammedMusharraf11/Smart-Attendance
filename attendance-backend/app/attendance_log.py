"""SQLite-backed attendance log and academic session manager."""
import sqlite3
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = str(DATA_DIR / "attendance.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    # 1. Main biometric scan attendance log
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

    # 2. Teachers Directory
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            subject TEXT,
            department TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    # 3. Class Sessions with dynamic cutoff window (in minutes)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS class_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_name TEXT NOT NULL,
            teacher_name TEXT NOT NULL,
            teacher_email TEXT NOT NULL,
            session_date TEXT NOT NULL,         -- 'YYYY-MM-DD'
            start_time TEXT NOT NULL,           -- 'HH:MM' (24h)
            end_time TEXT NOT NULL,             -- 'HH:MM' (24h)
            cutoff_minutes INTEGER DEFAULT 30,  -- Scans valid up to start_time + cutoff_minutes
            status TEXT DEFAULT 'scheduled',    -- 'scheduled' | 'active' | 'completed'
            email_sent INTEGER DEFAULT 0,       -- 0 = No, 1 = Yes
            email_sent_at TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    # 4. Email / SMTP Configuration
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS email_settings (
            id INTEGER PRIMARY KEY,
            smtp_host TEXT DEFAULT 'smtp.gmail.com',
            smtp_port INTEGER DEFAULT 587,
            smtp_user TEXT DEFAULT '',
            smtp_password TEXT DEFAULT '',
            sender_name TEXT DEFAULT 'Smart Attendance Kiosk',
            updated_at TEXT NOT NULL
        )
        """
    )

    # Ensure single row exists for email_settings
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM email_settings WHERE id = 1")
    if not cursor.fetchone():
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO email_settings (id, smtp_host, smtp_port, smtp_user, smtp_password, sender_name, updated_at)
            VALUES (1, 'smtp.gmail.com', 587, '', '', 'Smart Attendance Kiosk', ?)
            """,
            (now_iso,),
        )

    conn.commit()
    conn.close()


def mark_attendance(code: str, name: str, similarity: float) -> str:
    conn = get_connection()
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO attendance (code, name, similarity, timestamp) VALUES (?, ?, ?, ?)",
        (code, name, similarity, ts),
    )
    conn.commit()
    conn.close()
    return ts


def get_recent_attendance(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
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


# =========================================================================
# TEACHER DIRECTORY MANAGEMENT
# =========================================================================

def get_teachers() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, subject, department, created_at FROM teachers ORDER BY name ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_teacher(name: str, email: str, subject: str = "", department: str = "") -> Dict[str, Any]:
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    name_clean = name.strip()
    email_clean = email.strip().lower()
    subject_clean = subject.strip()
    dept_clean = department.strip()

    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO teachers (name, email, subject, department, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            name=excluded.name,
            subject=excluded.subject,
            department=excluded.department
        """,
        (name_clean, email_clean, subject_clean, dept_clean, now_iso),
    )
    teacher_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": teacher_id,
        "name": name_clean,
        "email": email_clean,
        "subject": subject_clean,
        "department": dept_clean,
    }


def delete_teacher(teacher_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM teachers WHERE id = ?", (teacher_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# =========================================================================
# CLASS SESSIONS & TIMETABLE MANAGEMENT
# =========================================================================

def get_sessions() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, subject_name, teacher_name, teacher_email, session_date,
               start_time, end_time, cutoff_minutes, status, email_sent, email_sent_at, created_at
        FROM class_sessions
        ORDER BY session_date DESC, start_time DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_session(session_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, subject_name, teacher_name, teacher_email, session_date,
               start_time, end_time, cutoff_minutes, status, email_sent, email_sent_at, created_at
        FROM class_sessions
        WHERE id = ?
        """,
        (session_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def add_session(
    subject_name: str,
    teacher_name: str,
    teacher_email: str,
    session_date: str,
    start_time: str,
    end_time: str,
    cutoff_minutes: int = 30,
) -> Dict[str, Any]:
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO class_sessions (
            subject_name, teacher_name, teacher_email, session_date,
            start_time, end_time, cutoff_minutes, status, email_sent, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, ?)
        """,
        (
            subject_name.strip(),
            teacher_name.strip(),
            teacher_email.strip().lower(),
            session_date.strip(),
            start_time.strip(),
            end_time.strip(),
            max(5, int(cutoff_minutes)),
            now_iso,
        ),
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": session_id,
        "subject_name": subject_name.strip(),
        "teacher_name": teacher_name.strip(),
        "teacher_email": teacher_email.strip().lower(),
        "session_date": session_date.strip(),
        "start_time": start_time.strip(),
        "end_time": end_time.strip(),
        "cutoff_minutes": max(5, int(cutoff_minutes)),
        "status": "scheduled",
        "email_sent": 0,
    }


def delete_session(session_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM class_sessions WHERE id = ?", (session_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def update_session_email_status(session_id: int) -> bool:
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE class_sessions SET email_sent = 1, email_sent_at = ? WHERE id = ?",
        (now_iso, session_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def get_active_session() -> Optional[Dict[str, Any]]:
    """Returns the currently active session based on local system time."""
    now_local = datetime.now().astimezone()
    today_str = now_local.strftime("%Y-%m-%d")
    current_time_str = now_local.strftime("%H:%M")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, subject_name, teacher_name, teacher_email, session_date,
               start_time, end_time, cutoff_minutes, status, email_sent, email_sent_at
        FROM class_sessions
        WHERE session_date = ?
        ORDER BY start_time ASC
        """,
        (today_str,),
    )
    rows = cursor.fetchall()
    conn.close()

    for r in rows:
        session = dict(r)
        # Parse start and end
        start = session["start_time"]
        end = session["end_time"]
        cutoff = session["cutoff_minutes"]

        # Calculate cutoff time string
        try:
            start_h, start_m = map(int, start.split(":"))
            total_cutoff_mins = start_h * 60 + start_m + cutoff
            cutoff_h = total_cutoff_mins // 60
            cutoff_m = total_cutoff_mins % 60
            cutoff_time_str = f"{cutoff_h:02d}:{cutoff_m:02d}"
        except Exception:
            cutoff_time_str = end

        # If current time is within [start_time - 10m, end_time]
        if start <= current_time_str <= end:
            session["is_within_cutoff"] = current_time_str <= cutoff_time_str
            session["cutoff_time"] = cutoff_time_str
            return session

    return None


# =========================================================================
# ATTENDANCE CALCULATION ENGINE (SESSION ROSTER, PRESENT & ABSENT)
# =========================================================================

def calculate_session_attendance(session_id: int, enrolled_students: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes Present vs. Absent lists for a class session.
    All enrolled students in the system are expected to attend.
    Any scan between (start_time - 5m) and (start_time + cutoff_minutes) is marked Present.
    The rest of the enrolled roster are marked Absent.
    """
    session = get_session(session_id)
    if not session:
        raise ValueError(f"Session #{session_id} not found")

    session_date = session["session_date"]
    start_time_str = session["start_time"]
    cutoff_minutes = session.get("cutoff_minutes", 30)

    # Compute window in minutes from midnight
    try:
        sh, sm = map(int, start_time_str.split(":"))
        start_min_from_midnight = sh * 60 + sm
        # 5 minute early grace buffer
        window_start_mins = max(0, start_min_from_midnight - 5)
        # Dynamic cutoff minutes
        window_end_mins = start_min_from_midnight + cutoff_minutes
    except Exception:
        window_start_mins = 0
        window_end_mins = 1440

    conn = get_connection()
    cursor = conn.cursor()
    # Query all scans recorded
    cursor.execute("SELECT code, name, similarity, timestamp FROM attendance ORDER BY id ASC")
    scans = cursor.fetchall()
    conn.close()

    present_map: Dict[str, Dict[str, Any]] = {}

    for scan in scans:
        raw_ts = scan["timestamp"]
        try:
            scan_dt = datetime.fromisoformat(raw_ts).astimezone()
            scan_date = scan_dt.strftime("%Y-%m-%d")
            scan_time_mins = scan_dt.hour * 60 + scan_dt.minute

            # Check if scan matches this session's date and is within the dynamic cutoff window
            if scan_date == session_date and window_start_mins <= scan_time_mins <= window_end_mins:
                code_clean = scan["code"].strip().upper()
                if code_clean not in present_map:
                    present_map[code_clean] = {
                        "code": code_clean,
                        "name": scan["name"] or code_clean,
                        "similarity": round(float(scan["similarity"]), 4),
                        "timestamp": raw_ts,
                        "time_in": scan_dt.strftime("%I:%M %p"),
                    }
        except Exception:
            continue

    # Build full roster lists
    present_list: List[Dict[str, Any]] = []
    absent_list: List[Dict[str, Any]] = []

    # Map of all enrolled students
    enrolled_dict = {s["code"].strip().upper(): s for s in enrolled_students}

    # Add verified enrolled students who scanned
    for code, p_data in present_map.items():
        if code in enrolled_dict:
            p_data["name"] = enrolled_dict[code].get("name") or p_data["name"]
        present_list.append(p_data)

    # Enrolled students who did NOT scan in the window are ABSENT
    for code, s_data in enrolled_dict.items():
        if code not in present_map:
            absent_list.append({
                "code": code,
                "name": s_data.get("name") or code,
                "status": "Absent",
            })

    # Sort lists alphabetically
    present_list.sort(key=lambda x: x["name"])
    absent_list.sort(key=lambda x: x["name"])

    total_enrolled = len(enrolled_students)
    present_count = len(present_list)
    absent_count = len(absent_list)
    percentage = round((present_count / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0

    return {
        "session": session,
        "summary": {
            "total_enrolled": total_enrolled,
            "present_count": present_count,
            "absent_count": absent_count,
            "attendance_percentage": percentage,
            "cutoff_minutes": cutoff_minutes,
        },
        "present": present_list,
        "absent": absent_list,
    }


# =========================================================================
# EMAIL SETTINGS
# =========================================================================

def get_email_settings() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT smtp_host, smtp_port, smtp_user, smtp_password, sender_name, updated_at FROM email_settings WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "sender_name": "Smart Attendance Kiosk",
        "updated_at": "",
    }


def save_email_settings(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    sender_name: str = "Smart Attendance Kiosk",
) -> Dict[str, Any]:
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE email_settings
        SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?, sender_name = ?, updated_at = ?
        WHERE id = 1
        """,
        (
            smtp_host.strip(),
            int(smtp_port),
            smtp_user.strip(),
            smtp_password.strip(),
            sender_name.strip(),
            now_iso,
        ),
    )
    conn.commit()
    conn.close()
    return get_email_settings()
