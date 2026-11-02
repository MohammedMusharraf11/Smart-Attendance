"""
Automated HTML Email Dispatcher for Class Attendance Reports.
Connects via standard SMTP (Gmail App Password, Outlook, or institutional SMTP).
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List

from app.attendance_log import (
    calculate_session_attendance,
    get_email_settings,
    get_session,
    update_session_email_status,
)

logger = logging.getLogger("mailer")
logger.setLevel(logging.INFO)


def _get_smtp_config() -> Dict[str, Any]:
    """Retrieves SMTP configuration from DB, falling back to environment variables."""
    db_settings = get_email_settings()

    host = db_settings.get("smtp_host") or os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(db_settings.get("smtp_port") or os.environ.get("SMTP_PORT", 587))
    user = (db_settings.get("smtp_user") or os.environ.get("SMTP_USER", "")).strip()
    password = (db_settings.get("smtp_password") or os.environ.get("SMTP_PASSWORD", "")).strip()
    sender_name = (
        db_settings.get("sender_name")
        or os.environ.get("SMTP_SENDER_NAME", "Smart Attendance System")
    ).strip()

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "sender_name": sender_name,
    }


def send_test_email(recipient_email: str) -> Dict[str, Any]:
    """Sends a verification email to test SMTP credentials."""
    config = _get_smtp_config()
    if not config["user"] or not config["password"]:
        raise ValueError(
            "SMTP credentials not configured. Please enter your email and App Password in Settings."
        )

    recipient_clean = recipient_email.strip().lower()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Smart Attendance — Test Email Notification"
    msg["From"] = f"{config['sender_name']} <{config['user']}>"
    msg["To"] = recipient_clean

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }}
        .card {{ background: #ffffff; border-radius: 12px; padding: 30px; max-width: 550px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }}
        .badge {{ display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; }}
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">SMTP SUCCESS</span>
        <h2 style="margin-top: 15px; color: #0f172a;">Smart Attendance System</h2>
        <p>This is a test notification confirming that your SMTP email settings are working correctly.</p>
        <p style="font-size: 13px; color: #64748b;">Connected server: <strong>{config['host']}:{config['port']}</strong></p>
      </div>
    </body>
    </html>
    """
    msg.attach(MIMEText(html_content, "html"))

    _dispatch_smtp(config, recipient_clean, msg)
    return {"status": "sent", "recipient": recipient_clean}


def send_attendance_report(
    session_id: int, enrolled_students: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generates and dispatches a structured HTML attendance report to the class teacher.
    """
    config = _get_smtp_config()
    if not config["user"] or not config["password"]:
        raise ValueError(
            "SMTP credentials not configured. Please enter your email and App Password in Settings."
        )

    report_data = calculate_session_attendance(session_id, enrolled_students)
    session = report_data["session"]
    summary = report_data["summary"]
    present_list = report_data["present"]
    absent_list = report_data["absent"]

    teacher_email = session.get("teacher_email", "").strip().lower()
    if not teacher_email:
        raise ValueError("No teacher email address specified for this session.")

    subject_name = session.get("subject_name", "Class")
    session_date = session.get("session_date", "")
    start_time = session.get("start_time", "")
    end_time = session.get("end_time", "")
    cutoff_mins = session.get("cutoff_minutes", 30)

    email_subject = f"[{subject_name}] Attendance Report — {session_date} ({start_time} - {end_time})"

    # Generate Absent Students Table Rows
    absent_rows_html = ""
    if absent_list:
        for idx, student in enumerate(absent_list, 1):
            absent_rows_html += f"""
            <tr style="border-bottom: 1px solid #fee2e2;">
              <td style="padding: 10px 14px; font-size: 13px; color: #64748b; font-family: monospace;">{idx}</td>
              <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #b91c1c; font-family: monospace;">{student['code']}</td>
              <td style="padding: 10px 14px; font-size: 13px; font-weight: 500; color: #1e293b;">{student['name']}</td>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #dc2626;"><span style="background: #fee2e2; padding: 2px 8px; border-radius: 4px;">ABSENT</span></td>
            </tr>
            """
    else:
        absent_rows_html = """
        <tr>
          <td colspan="4" style="padding: 15px; text-align: center; color: #10b981; font-weight: bold; font-size: 13px;">
            🎉 All students were present! Zero absentees.
          </td>
        </tr>
        """

    # Generate Present Students Table Rows
    present_rows_html = ""
    if present_list:
        for idx, student in enumerate(present_list, 1):
            time_in = student.get("time_in", "—")
            similarity = student.get("similarity", 0.0)
            score_pct = f"{round(similarity * 100, 1)}%"
            present_rows_html += f"""
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 14px; font-size: 13px; color: #64748b; font-family: monospace;">{idx}</td>
              <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #0284c7; font-family: monospace;">{student['code']}</td>
              <td style="padding: 10px 14px; font-size: 13px; font-weight: 500; color: #1e293b;">{student['name']}</td>
              <td style="padding: 10px 14px; font-size: 13px; color: #334155;">{time_in}</td>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #16a34a;"><span style="background: #dcfce7; padding: 2px 8px; border-radius: 4px;">{score_pct}</span></td>
            </tr>
            """
    else:
        present_rows_html = """
        <tr>
          <td colspan="5" style="padding: 15px; text-align: center; color: #64748b; font-size: 13px;">
            No scans recorded within the attendance window.
          </td>
        </tr>
        """

    # Full Styled HTML Email Template
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }}
        .wrapper {{ max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }}
        .header {{ background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 28px 24px; }}
        .title {{ font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }}
        .subtitle {{ font-size: 13px; color: #bae6fd; margin-top: 6px; }}
        .stats-grid {{ display: table; width: 100%; border-collapse: collapse; margin-top: 18px; }}
        .stat-box {{ display: table-cell; width: 25%; text-align: center; padding: 12px; background: rgba(255,255,255,0.12); border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); }}
        .stat-val {{ font-size: 22px; font-weight: 800; color: #ffffff; }}
        .stat-lbl {{ font-size: 11px; text-transform: uppercase; color: #e0f2fe; font-weight: 600; margin-top: 2px; }}
        .content {{ padding: 24px; }}
        .section-header {{ font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }}
        .table-wrap {{ width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; margin-bottom: 24px; }}
        .table-wrap th {{ background: #f8fafc; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; text-align: left; border-bottom: 1px solid #e2e8f0; }}
        .footer {{ background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1 class="title">Smart Attendance Report</h1>
          <div class="subtitle">
            <strong>{subject_name}</strong> | Faculty: {session.get('teacher_name', 'Teacher')} | {session_date} ({start_time} - {end_time})
          </div>
          <div style="font-size: 11px; color: #e0f2fe; margin-top: 4px;">
            Attendance Grace Period: <strong>{cutoff_mins} minutes</strong> from class start
          </div>
          
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-val">{summary['total_enrolled']}</div>
              <div class="stat-lbl">Enrolled</div>
            </div>
            <div style="display: table-cell; width: 2%;"></div>
            <div class="stat-box" style="background: rgba(34, 197, 94, 0.25);">
              <div class="stat-val" style="color: #4ade80;">{summary['present_count']}</div>
              <div class="stat-lbl">Present</div>
            </div>
            <div style="display: table-cell; width: 2%;"></div>
            <div class="stat-box" style="background: rgba(239, 68, 68, 0.25);">
              <div class="stat-val" style="color: #f87171;">{summary['absent_count']}</div>
              <div class="stat-lbl">Absent</div>
            </div>
            <div style="display: table-cell; width: 2%;"></div>
            <div class="stat-box">
              <div class="stat-val">{summary['attendance_percentage']}%</div>
              <div class="stat-lbl">Turnout</div>
            </div>
          </div>
        </div>

        <div class="content">
          <!-- ABSENT LIST -->
          <div class="section-header" style="color: #dc2626;">
            Absent Students ({summary['absent_count']})
          </div>
          <table class="table-wrap" style="border-color: #fee2e2;">
            <thead>
              <tr style="background: #fef2f2;">
                <th>#</th>
                <th>Roll / ID</th>
                <th>Student Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {absent_rows_html}
            </tbody>
          </table>

          <!-- PRESENT LIST -->
          <div class="section-header" style="color: #0284c7; margin-top: 10px;">
            Present Students ({summary['present_count']})
          </div>
          <table class="table-wrap">
            <thead>
              <tr>
                <th>#</th>
                <th>Roll / ID</th>
                <th>Student Name</th>
                <th>Check-in Time</th>
                <th>Match Score</th>
              </tr>
            </thead>
            <tbody>
              {present_rows_html}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Generated automatically by Smart Attendance Biometric System with Blink Liveness.<br>
          Delivered to {teacher_email}
        </div>
      </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = email_subject
    msg["From"] = f"{config['sender_name']} <{config['user']}>"
    msg["To"] = teacher_email
    msg.attach(MIMEText(html_content, "html"))

    _dispatch_smtp(config, teacher_email, msg)
    update_session_email_status(session_id)

    logger.info(f"Attendance report successfully emailed to {teacher_email} for session #{session_id}")
    return {
        "status": "sent",
        "recipient": teacher_email,
        "subject": email_subject,
        "present_count": summary["present_count"],
        "absent_count": summary["absent_count"],
    }


def _dispatch_smtp(config: Dict[str, Any], recipient: str, msg: MIMEMultipart):
    """Handles the actual SMTP transport with TLS and authentication."""
    host = config["host"]
    port = config["port"]
    user = config["user"]
    password = config["password"]

    try:
        if port == 465:
            # SSL Connection
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            # Standard TLS connection
            server = smtplib.SMTP(host, port, timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(user, password)
        server.sendmail(user, [recipient], msg.as_string())
        server.quit()
    except Exception as exc:
        logger.error(f"Failed to deliver email via SMTP: {exc}")
        raise RuntimeError(f"SMTP error ({host}:{port}): {str(exc)}")
