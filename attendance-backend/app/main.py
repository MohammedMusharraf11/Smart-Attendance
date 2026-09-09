import asyncio
import io
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from app.attendance_log import init_db, mark_attendance, get_recent_attendance
from app.db import delete_student, enroll_embedding, list_students, query_best_match
from app.device_controller import device_controller
from app.model import get_embedding, get_model
from app.qr import decode_qr

MATCH_THRESHOLD = 0.40  # cosine similarity — tune after real-world testing

# In-memory bridge state for ESP32 trigger and polling
trigger_state = {"active": False, "triggered_at": None}
latest_result = {"available": False}

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
    """Called by ESP32 when ultrasonic sensor detects proximity."""
    trigger_state["active"] = True
    trigger_state["triggered_at"] = time.time()
    latest_result.clear()
    latest_result.update({"available": False})
    return {"status": "triggered"}


@app.post("/trigger/reset")
def trigger_reset():
    """Reset trigger state when cancelled or timed out."""
    trigger_state["active"] = False
    return {"status": "reset"}


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
        latest_result.update({**result, "available": True})
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
    latest_result.update({**result, "available": True})
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

