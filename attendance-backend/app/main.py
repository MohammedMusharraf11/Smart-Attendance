"""Smart attendance backend — enroll, infer, QR decode, and mark attendance."""
import io

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from app.attendance_log import init_db, mark_attendance, get_recent_attendance
from app.db import delete_student, enroll_embedding, list_students, query_best_match
from app.model import get_embedding, get_model
from app.qr import decode_qr

MATCH_THRESHOLD = 0.40  # cosine similarity — tune after real-world testing

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


def read_upload_to_bgr(file_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


@app.get("/health")
def health():
    return {"status": "ok"}


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

    face_code, face_name, score = query_best_match(embedding)
    qr_code_clean = qr_code.strip().upper()

    matched = (
        face_code is not None
        and score >= MATCH_THRESHOLD
        and face_code == qr_code_clean
    )

    if matched:
        timestamp = mark_attendance(face_code, face_name, score)
        return {
            "marked": True,
            "code": face_code,
            "name": face_name,
            "similarity": round(float(score), 4),
            "timestamp": timestamp,
        }

    return {
        "marked": False,
        "qr_code": qr_code_clean,
        "face_predicted": face_code,
        "similarity": round(float(score), 4) if face_code else 0.0,
        "reason": "mismatch or below confidence threshold",
    }


@app.get("/attendance/recent")
def get_recent_attendance_records(limit: int = 50):
    """List recent attendance logs from SQLite."""
    return {"records": get_recent_attendance(limit=limit)}

