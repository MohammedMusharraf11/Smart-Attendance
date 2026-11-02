import asyncio
import io
import logging
from pathlib import Path
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

from app.attendance_log import (
    init_db,
    mark_attendance,
    get_recent_attendance,
    get_teachers,
    add_teacher,
    delete_teacher,
    get_sessions,
    add_session,
    delete_session,
    get_session,
    get_active_session,
    calculate_session_attendance,
    get_email_settings,
    save_email_settings,
)
from app.db import delete_student, enroll_embedding, list_students, query_best_match
from app.device_controller import device_controller
from app.liveness import check_blink
from app.mailer import send_attendance_report, send_test_email
from app.model import get_embedding, get_model
from app.qr import decode_qr

logger = logging.getLogger("main")

MATCH_THRESHOLD = 0.40  # cosine similarity — tune after real-world testing

# In-memory bridge state for ESP32 trigger and polling
# "phase" tracks progress through the capture flow (scanning_qr -> blink -> processing -> done)
# so both the ESP32's LCD and the frontend's live status card can reflect real progress
# from one shared source, instead of two disconnected state systems.
trigger_state = {"active": False, "triggered_at": None}
latest_result = {"available": False, "phase": "idle"}

app = FastAPI(title="Smart Attendance Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    get_model()  # warm up so the first real request isn't slow
    init_db()
    try:
        loop = asyncio.get_running_loop()
        device_controller.set_async_loop(loop)
    except Exception:
        pass
    device_controller.start()


@app.on_event("shutdown")
def shutdown():
    device_controller.stop()


def read_upload_to_bgr(file_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/trigger")
def trigger():
    """Called by ESP32 when ultrasonic sensor detects proximity.
    Enforces a 5-second cooldown to prevent rapid re-triggers while
    the previous cycle is still completing."""
    now = time.time()
    last = trigger_state.get("triggered_at")
    if last and (now - last) < 5.0 and trigger_state.get("active"):
        return {"status": "debounced", "detail": "Trigger ignored — previous cycle still active"}
    trigger_state["active"] = True
    trigger_state["triggered_at"] = now
    latest_result.clear()
    latest_result.update({"available": False, "phase": "scanning_qr"})
    return {"status": "triggered"}


@app.post("/phase")
def set_phase(payload: dict):
    """
    Called by the frontend as it moves through the capture flow, so the ESP32's LCD
    and the frontend's own live status card can both reflect real progress.
    Expected body: {"phase": "scanning_qr" | "blink" | "processing"}
    """
    phase = payload.get("phase")
    if phase not in ("scanning_qr", "blink", "processing"):
        raise HTTPException(400, "phase must be one of: scanning_qr, blink, processing")
    latest_result["phase"] = phase
    return {"status": "ok", "phase": phase}


@app.post("/trigger/reset")
def trigger_reset():
    """Reset trigger state when cancelled or timed out."""
    trigger_state["active"] = False
    return {"status": "reset"}


@app.post("/trigger/fail")
def trigger_fail(payload: dict = None):
    """Explicitly reports a failed cycle from kiosk to ESP32."""
    reason = (payload or {}).get("reason", "verification_failed")
    _record_failure_state(reason, "")
    return {"status": "recorded"}


@app.get("/trigger-status")
def get_trigger_status():
    """Polled by frontend to detect when proximity trigger is active."""
    return trigger_state


@app.get("/latest-result")
def get_latest_result():
    """Polled by ESP32 to receive the latest attendance verification outcome."""
    return latest_result


@app.get("/device-state")
def get_device_state():
    """Returns the current state of the hardware device controller."""
    return device_controller.current_state


@app.post("/device/trigger")
def trigger_device_cycle():
    """Programmatically triggers an attendance verification cycle on the device controller."""
    device_controller.trigger_cycle_now()
    return {"status": "triggered"}


@app.websocket("/ws/device-state")
async def websocket_device_state(websocket: WebSocket):
    """Real-time WebSocket streaming device state updates to the frontend dashboard."""
    await websocket.accept()
    # Send current state upon connecting
    await websocket.send_json(device_controller.current_state)
    device_controller.register_ws(websocket)
    try:
        while True:
            # Keep connection open; can receive pings from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        device_controller.unregister_ws(websocket)


@app.post("/enroll")
async def enroll(name: str = Form(...), code: str = Form(...), image: UploadFile = File(...)):
    """Add one face image for a student. Call multiple times per student (5-8 images recommended)."""
    contents = await image.read()
    img = read_upload_to_bgr(contents)
    embedding = get_embedding(img)
    if embedding is None:
        raise HTTPException(400, "No face detected in the uploaded image")

    code_clean = code.strip().upper()
    name_clean = name.strip()
    entry_id = enroll_embedding(code_clean, name_clean, embedding)
    return {"status": "enrolled", "code": code_clean, "name": name_clean, "entry_id": entry_id}


@app.get("/students")
def get_students():
    """List every enrolled student with how many images they have on file."""
    return {"students": list_students()}


@app.delete("/students/{code}")
def remove_student(code: str):
    """Delete a student and all their enrolled face images from the vector DB."""
    code_clean = code.strip().upper()
    deleted_count = delete_student(code_clean)
    if deleted_count == 0:
        raise HTTPException(404, f"No enrolled images found for code {code_clean}")
    return {"status": "deleted", "code": code_clean, "images_removed": deleted_count}


@app.post("/infer")
async def infer(image: UploadFile = File(...)):
    """Given a face image, return the predicted name + CODE (or no match)."""
    contents = await image.read()
    img = read_upload_to_bgr(contents)
    embedding = get_embedding(img)
    if embedding is None:
        raise HTTPException(400, "No face detected in the uploaded image")

    code, name, score = query_best_match(embedding)
    matched = code is not None and score >= MATCH_THRESHOLD
    return {
        "match": matched,
        "code": code if matched else None,
        "name": name if matched else None,
        "similarity": round(float(score), 4),
    }


@app.post("/qr-decode")
async def qr_decode(image: UploadFile = File(...)):
    """Decode a QR code (e.g. photo of an ID card) and return its raw value."""
    contents = await image.read()
    img = read_upload_to_bgr(contents)
    data = decode_qr(img)
    if data is None:
        raise HTTPException(400, "No QR code detected in the uploaded image")
    return {"data": data}


def _record_failure_state(reason: str, qr_code: str = None) -> dict:
    """Updates latest_result and trigger_state so hardware and dashboard never hang on failure."""
    fail_res = {
        "marked": False,
        "available": True,
        "phase": "done",
        "reason": reason,
        "qr_code": qr_code,
    }
    latest_result.clear()
    latest_result.update(fail_res)
    trigger_state["active"] = False
    return fail_res


def _process_attendance_match(qr_code_clean: str, embedding: np.ndarray) -> dict:
    face_code, face_name, score = query_best_match(embedding)

    matched = (
        face_code is not None
        and score >= MATCH_THRESHOLD
        and face_code == qr_code_clean
    )

    if matched:
        timestamp = mark_attendance(face_code, face_name, score)
        result = {
            "marked": True,
            "code": face_code,
            "name": face_name,
            "similarity": round(float(score), 4),
            "timestamp": timestamp,
        }
        latest_result.clear()
        latest_result.update({**result, "available": True, "phase": "done"})
        trigger_state["active"] = False
        return result

    result = {
        "marked": False,
        "qr_code": qr_code_clean,
        "face_predicted": face_code,
        "similarity": round(float(score), 4) if face_code else 0.0,
        "reason": "mismatch or below confidence threshold",
    }
    latest_result.clear()
    latest_result.update({**result, "available": True, "phase": "done"})
    trigger_state["active"] = False
    return result


@app.post("/mark-attendance")
async def mark_attendance_endpoint(qr_code: str = Form(...), image: UploadFile = File(...)):
    """
    Main endpoint: takes the already-decoded QR value (call /qr-decode first, or
    decode client-side) plus a face image. Marks attendance only if the face
    prediction matches the QR code and clears the similarity threshold.
    """
    contents = await image.read()
    img = read_upload_to_bgr(contents)
    embedding = get_embedding(img)
    if embedding is None:
        raise HTTPException(400, "No face detected in the uploaded image")

    qr_code_clean = qr_code.strip().upper()
    return _process_attendance_match(qr_code_clean, embedding)


@app.post("/mark-attendance-live")
def mark_attendance_live_endpoint(
    qr_code: str = Form(...),
    frames: list[UploadFile] = File(...),
):
    """
    Live kiosk verification endpoint with server-side adaptive MediaPipe EAR blink detection.
    Requires 10-40 downscaled frames (~10 fps over 3s burst).
    Guarantees state recovery on ANY failure so ESP32 and frontend never hang.
    """
    qr_code_clean = qr_code.strip().upper()
    try:
        # Validate frame count (10-40 frames)
        if len(frames) < 10 or len(frames) > 40:
            reason = f"Invalid frame count: received {len(frames)}, expected 10-40 frames"
            _record_failure_state(reason, qr_code_clean)
            raise HTTPException(400, reason)

        # Sort frames by filename to ensure strictly temporal order (frame_00.jpg, frame_01.jpg, ...)
        sorted_frames = sorted(frames, key=lambda f: f.filename or "")

        # Read frames and validate per-frame file size (<= 1MB)
        decoded_images: list[np.ndarray] = []
        for file in sorted_frames:
            contents = file.file.read()
            if len(contents) > 1_048_576:
                reason = f"Frame {file.filename} exceeds maximum size of 1MB ({len(contents)} bytes)"
                _record_failure_state(reason, qr_code_clean)
                raise HTTPException(400, reason)
            img = read_upload_to_bgr(contents)
            decoded_images.append(img)

        # Run adaptive Eye Aspect Ratio blink check
        liveness_res = check_blink(decoded_images)
        log_msg = (
            f"[LIVENESS] code={qr_code_clean} passed={liveness_res['passed']} "
            f"reason={liveness_res['reason']} baseline_ear={liveness_res.get('baseline_ear')} "
            f"min_ear={liveness_res.get('min_ear')} closed_run={liveness_res.get('closed_run_length')} "
            f"faces={liveness_res.get('frames_with_face')}/{liveness_res.get('frames_total')}"
        )
        logger.info(log_msg)
        print(f" {log_msg}")

        if not liveness_res["passed"]:
            fail_reason = liveness_res["reason"]
            _record_failure_state(fail_reason, qr_code_clean)
            return {
                "marked": False,
                "reason": fail_reason,
                "liveness": liveness_res,
                "qr_code": qr_code_clean,
            }

        # Select the sharpest open frame identified by liveness check
        best_idx = liveness_res.get("best_frame_index", 0)
        best_frame = decoded_images[best_idx]
        embedding = get_embedding(best_frame)

        if embedding is None:
            reason = "no_face_in_best_frame"
            _record_failure_state(reason, qr_code_clean)
            return {
                "marked": False,
                "reason": reason,
                "liveness": liveness_res,
                "qr_code": qr_code_clean,
            }

        result = _process_attendance_match(qr_code_clean, embedding)
        result["liveness"] = liveness_res
        logger.info(
            f"Live attendance verification for {qr_code_clean}: marked={result.get('marked')} "
            f"score={result.get('similarity')} name={result.get('name')}"
        )
        return result

    except HTTPException:
        raise
    except Exception as exc:
        reason = f"Internal server error: {str(exc)}"
        logger.error(f"Unhandled exception in /mark-attendance-live: {exc}", exc_info=True)
        _record_failure_state(reason, qr_code_clean)
        raise HTTPException(500, reason)


@app.post("/mark-attendance-single")
async def mark_attendance_single_endpoint(image: UploadFile = File(...)):
    """
    Combined single-image endpoint: student holds ID card (with QR) while their
    face is also in frame. Runs QR detection and face recognition on the same image.
    """
    contents = await image.read()
    img = read_upload_to_bgr(contents)

    qr_data = decode_qr(img)
    if qr_data is None:
        raise HTTPException(400, "No QR code detected in the uploaded image")

    embedding = get_embedding(img)
    if embedding is None:
        raise HTTPException(400, "No face detected in the uploaded image")

    qr_code_clean = qr_data.strip().upper()
    return _process_attendance_match(qr_code_clean, embedding)


@app.get("/attendance/recent")
def get_recent_attendance_records(limit: int = 50):
    """List recent attendance logs from SQLite."""
    return {"records": get_recent_attendance(limit=limit)}


# -------------------------------------------------------------------------
# TEACHER DIRECTORY
# -------------------------------------------------------------------------
@app.get("/teachers")
def list_teachers_endpoint():
    return {"teachers": get_teachers()}


@app.post("/teachers")
def create_teacher_endpoint(payload: dict):
    name = payload.get("name", "").strip()
    email = payload.get("email", "").strip()
    subject = payload.get("subject", "").strip()
    department = payload.get("department", "").strip()
    if not name or not email:
        raise HTTPException(400, "Name and Email are required fields.")
    return add_teacher(name, email, subject, department)


@app.delete("/teachers/{teacher_id}")
def delete_teacher_endpoint(teacher_id: int):
    success = delete_teacher(teacher_id)
    if not success:
        raise HTTPException(404, "Teacher not found")
    return {"status": "deleted", "id": teacher_id}


# -------------------------------------------------------------------------
# CLASS SESSIONS & TIMETABLE
# -------------------------------------------------------------------------
@app.get("/sessions")
def list_sessions_endpoint():
    return {"sessions": get_sessions()}


@app.post("/sessions")
def create_session_endpoint(payload: dict):
    subject_name = payload.get("subject_name", "").strip()
    teacher_name = payload.get("teacher_name", "").strip()
    teacher_email = payload.get("teacher_email", "").strip()
    session_date = payload.get("session_date", "").strip()
    start_time = payload.get("start_time", "").strip()
    end_time = payload.get("end_time", "").strip()
    cutoff_minutes = int(payload.get("cutoff_minutes", 30))

    if not subject_name or not teacher_email or not session_date or not start_time:
        raise HTTPException(400, "Subject name, teacher email, date, and start time are required.")

    return add_session(
        subject_name=subject_name,
        teacher_name=teacher_name,
        teacher_email=teacher_email,
        session_date=session_date,
        start_time=start_time,
        end_time=end_time or start_time,
        cutoff_minutes=cutoff_minutes,
    )


@app.delete("/sessions/{session_id}")
def delete_session_endpoint(session_id: int):
    success = delete_session(session_id)
    if not success:
        raise HTTPException(404, "Session not found")
    return {"status": "deleted", "id": session_id}


@app.get("/sessions/active")
def get_active_session_endpoint():
    return {"session": get_active_session()}


@app.get("/sessions/{session_id}/report")
def get_session_report_endpoint(session_id: int):
    try:
        enrolled = list_students()
        return calculate_session_attendance(session_id, enrolled)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@app.post("/sessions/{session_id}/send-email")
def send_session_email_endpoint(session_id: int):
    try:
        enrolled = list_students()
        res = send_attendance_report(session_id, enrolled)
        return res
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Failed to send email: {str(exc)}")


# -------------------------------------------------------------------------
# EMAIL / SMTP SETTINGS
# -------------------------------------------------------------------------
@app.get("/settings/email")
def get_email_settings_endpoint():
    settings = get_email_settings()
    has_pwd = bool(settings.get("smtp_password"))
    masked = dict(settings)
    masked["has_password"] = has_pwd
    if has_pwd:
        masked["smtp_password"] = "••••••••••••"
    return {"settings": masked}


@app.post("/settings/email")
def update_email_settings_endpoint(payload: dict):
    current = get_email_settings()
    host = payload.get("smtp_host", current["smtp_host"])
    port = int(payload.get("smtp_port", current["smtp_port"]))
    user = payload.get("smtp_user", current["smtp_user"])
    password = payload.get("smtp_password", "")
    if not password or password == "••••••••••••":
        password = current.get("smtp_password", "")
    sender_name = payload.get("sender_name", current["sender_name"])

    saved = save_email_settings(
        smtp_host=host,
        smtp_port=port,
        smtp_user=user,
        smtp_password=password,
        sender_name=sender_name,
    )
    return {"status": "saved", "settings": saved}


@app.post("/settings/email/test")
def test_email_endpoint(payload: dict):
    recipient = payload.get("recipient", "").strip()
    if not recipient:
        raise HTTPException(400, "Recipient email is required.")
    try:
        return send_test_email(recipient)
    except Exception as exc:
        raise HTTPException(400, str(exc))


# Mount Next.js static export if built (runs entire system on port 8000 without Node.js)
frontend_out = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"
if frontend_out.exists():
    app.mount("/", StaticFiles(directory=str(frontend_out), html=True), name="static")
