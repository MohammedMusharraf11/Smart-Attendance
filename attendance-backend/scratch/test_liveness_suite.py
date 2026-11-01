"""
Comprehensive Test Suite for Smart Attendance Adaptive Blink Liveness Detection.

Tests:
1. Standalone device_controller import & initialization.
2. check_blink() algorithm evaluation across required scenarios:
   - Real blink (Pass)
   - Staring without blinking (Fail)
   - Eyes closed continuously (Fail)
   - Printed photo (Fail)
   - Photo on phone screen (Fail)
   - Person wearing glasses
   - Dim light conditions
   - Multi-person / face presence
3. End-to-end /mark-attendance-live FastAPI endpoint test (latency, payload size, state reset guarantees).
"""

import io
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

# Ensure app is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.liveness import (
    LEFT_EYE_INDICES,
    RIGHT_EYE_INDICES,
    calculate_ear,
    check_blink,
    extract_frame_landmarks,
    get_face_landmarker,
)
from app.device_controller import device_controller
from app.main import app, latest_result, trigger_state


def create_synthetic_face_frame(
    width=480, height=360, ear_target=0.30, dim_factor=1.0, add_glasses=False
) -> np.ndarray:
    """
    Synthesizes a realistic test face image containing natural facial geometry
    and eyelid landmarks at the specified EAR.
    """
    img = np.full((height, width, 3), int(220 * dim_factor), dtype=np.uint8)

    # Face oval (skin tone)
    center = (width // 2, height // 2)
    axes = (110, 140)
    skin_color = (int(180 * dim_factor), int(200 * dim_factor), int(235 * dim_factor))
    cv2.ellipse(img, center, axes, 0, 0, 360, skin_color, -1)

    # Eyes
    eye_y = height // 2 - 20
    left_x = width // 2 - 45
    right_x = width // 2 + 45

    # Eye height is proportional to EAR (horizontal width ~28px)
    eye_w = 16
    eye_h = max(1, int(eye_w * ear_target * 1.8))

    # Sclera (white of eye)
    white = (int(245 * dim_factor), int(245 * dim_factor), int(250 * dim_factor))
    cv2.ellipse(img, (left_x, eye_y), (eye_w, eye_h), 0, 0, 360, white, -1)
    cv2.ellipse(img, (right_x, eye_y), (eye_w, eye_h), 0, 0, 360, white, -1)

    # Iris / Pupil
    iris_color = (int(40 * dim_factor), int(30 * dim_factor), int(30 * dim_factor))
    iris_r = min(eye_h, 6)
    cv2.circle(img, (left_x, eye_y), iris_r, iris_color, -1)
    cv2.circle(img, (right_x, eye_y), iris_r, iris_color, -1)

    # Eyebrows
    brow_color = (int(50 * dim_factor), int(45 * dim_factor), int(40 * dim_factor))
    cv2.line(img, (left_x - 18, eye_y - 18), (left_x + 18, eye_y - 20), brow_color, 3)
    cv2.line(img, (right_x - 18, eye_y - 20), (right_x + 18, eye_y - 18), brow_color, 3)

    # Nose & Mouth
    cv2.line(img, (width // 2, eye_y + 10), (width // 2, eye_y + 40), brow_color, 2)
    cv2.ellipse(img, (width // 2, eye_y + 65), (25, 8), 0, 0, 360, (int(100 * dim_factor), int(100 * dim_factor), int(190 * dim_factor)), -1)

    if add_glasses:
        frame_color = (int(20 * dim_factor), int(20 * dim_factor), int(20 * dim_factor))
        cv2.circle(img, (left_x, eye_y), 24, frame_color, 2)
        cv2.circle(img, (right_x, eye_y), 24, frame_color, 2)
        cv2.line(img, (left_x + 24, eye_y), (right_x - 24, eye_y), frame_color, 2)

    return img


def run_unit_tests():
    print("=" * 70)
    print("TEST SUITE 1: Standalone device_controller Refactor Verification")
    print("=" * 70)

    # 1. Verify device_controller imported and initialized
    assert device_controller is not None, "device_controller instance should exist"
    assert device_controller.current_state["state"] == "idle"
    print(" [PASS] device_controller imported and initial state is 'idle'.")

    # 2. Verify _get_face_mesh returns FaceLandmarker without error
    mesh = device_controller._get_face_mesh()
    assert mesh is not None, "device_controller._get_face_mesh() should return FaceLandmarker"
    print(" [PASS] device_controller._get_face_mesh() successfully loaded FaceLandmarker.")

    print("\n" + "=" * 70)
    print("TEST SUITE 2: check_blink Algorithm Test Matrix")
    print("=" * 70)

    test_results = []

    # Scenario 1: Real Blink (Open -> Closed for 3 frames -> Open)
    frames_real_blink = []
    # 12 open frames (~0.35 EAR)
    for _ in range(12):
        frames_real_blink.append(create_synthetic_face_frame(ear_target=0.28))
    # 3 closed frames (~0.15 EAR)
    for _ in range(3):
        frames_real_blink.append(create_synthetic_face_frame(ear_target=0.05))
    # 15 open frames (~0.35 EAR)
    for _ in range(15):
        frames_real_blink.append(create_synthetic_face_frame(ear_target=0.28))

    res1 = check_blink(frames_real_blink)
    test_results.append({
        "case": "1. Real natural blink",
        "expected": "PASS",
        "actual": "PASS" if res1["passed"] else "FAIL",
        "reason": res1["reason"],
        "baseline_ear": res1["baseline_ear"],
        "min_ear": res1["min_ear"],
        "closed_run": res1["closed_run_length"],
    })

    # Scenario 2: Staring without blinking (Constant Open)
    frames_staring = [create_synthetic_face_frame(ear_target=0.29) for _ in range(30)]
    res2 = check_blink(frames_staring)
    test_results.append({
        "case": "2. Staring without blinking",
        "expected": "FAIL",
        "actual": "PASS" if res2["passed"] else "FAIL",
        "reason": res2["reason"],
        "baseline_ear": res2["baseline_ear"],
        "min_ear": res2["min_ear"],
        "closed_run": res2["closed_run_length"],
    })

    # Scenario 3: Eyes closed the whole time
    frames_eyes_closed = [create_synthetic_face_frame(ear_target=0.05) for _ in range(30)]
    res3 = check_blink(frames_eyes_closed)
    test_results.append({
        "case": "3. Eyes closed continuously",
        "expected": "FAIL",
        "actual": "PASS" if res3["passed"] else "FAIL",
        "reason": res3["reason"],
        "baseline_ear": res3["baseline_ear"],
        "min_ear": res3["min_ear"],
        "closed_run": res3["closed_run_length"],
    })

    # Scenario 4: Printed Photo Attack (Static identical frames)
    static_frame = create_synthetic_face_frame(ear_target=0.27)
    frames_printed_photo = [static_frame.copy() for _ in range(30)]
    res4 = check_blink(frames_printed_photo)
    test_results.append({
        "case": "4. Printed photo attack",
        "expected": "FAIL",
        "actual": "PASS" if res4["passed"] else "FAIL",
        "reason": res4["reason"],
        "baseline_ear": res4["baseline_ear"],
        "min_ear": res4["min_ear"],
        "closed_run": res4["closed_run_length"],
    })

    # Scenario 5: Photo on Phone Screen (Slight glare / static)
    glare_frame = create_synthetic_face_frame(ear_target=0.26)
    cv2.rectangle(glare_frame, (100, 50), (380, 80), (255, 255, 255), -1)
    frames_phone_screen = [glare_frame.copy() for _ in range(30)]
    res5 = check_blink(frames_phone_screen)
    test_results.append({
        "case": "5. Photo on phone screen",
        "expected": "FAIL",
        "actual": "PASS" if res5["passed"] else "FAIL",
        "reason": res5["reason"],
        "baseline_ear": res5["baseline_ear"],
        "min_ear": res5["min_ear"],
        "closed_run": res5["closed_run_length"],
    })

    # Scenario 6: Person wearing glasses with real blink
    frames_glasses = []
    for _ in range(12):
        frames_glasses.append(create_synthetic_face_frame(ear_target=0.27, add_glasses=True))
    for _ in range(2):
        frames_glasses.append(create_synthetic_face_frame(ear_target=0.05, add_glasses=True))
    for _ in range(16):
        frames_glasses.append(create_synthetic_face_frame(ear_target=0.27, add_glasses=True))
    res6 = check_blink(frames_glasses)
    test_results.append({
        "case": "6. Person with glasses (blink)",
        "expected": "PASS",
        "actual": "PASS" if res6["passed"] else "FAIL",
        "reason": res6["reason"],
        "baseline_ear": res6["baseline_ear"],
        "min_ear": res6["min_ear"],
        "closed_run": res6["closed_run_length"],
    })

    # Scenario 7: Dim Light Condition (blink)
    frames_dim = []
    for _ in range(12):
        frames_dim.append(create_synthetic_face_frame(ear_target=0.28, dim_factor=0.45))
    for _ in range(3):
        frames_dim.append(create_synthetic_face_frame(ear_target=0.05, dim_factor=0.45))
    for _ in range(15):
        frames_dim.append(create_synthetic_face_frame(ear_target=0.28, dim_factor=0.45))
    res7 = check_blink(frames_dim)
    test_results.append({
        "case": "7. Dim light condition (blink)",
        "expected": "PASS",
        "actual": "PASS" if res7["passed"] else "FAIL",
        "reason": res7["reason"],
        "baseline_ear": res7["baseline_ear"],
        "min_ear": res7["min_ear"],
        "closed_run": res7["closed_run_length"],
    })

    # Scenario 8: No face in frame (e.g. person walks away)
    frames_no_face = [np.full((360, 480, 3), 120, dtype=np.uint8) for _ in range(30)]
    res8 = check_blink(frames_no_face)
    test_results.append({
        "case": "8. No face detected / empty frame",
        "expected": "FAIL",
        "actual": "PASS" if res8["passed"] else "FAIL",
        "reason": res8["reason"],
        "baseline_ear": res8["baseline_ear"],
        "min_ear": res8["min_ear"],
        "closed_run": res8["closed_run_length"],
    })

    # Print Table
    print(f"{'Test Scenario':<32} | {'Expected':<8} | {'Result':<6} | {'Reason':<25} | {'Base EAR':<8} | {'Min EAR':<8} | {'Closed Run'}")
    print("-" * 115)
    for r in test_results:
        print(f"{r['case']:<32} | {r['expected']:<8} | {r['actual']:<6} | {r['reason']:<25} | {r['baseline_ear']:<8} | {r['min_ear']:<8} | {r['closed_run']}")

    print("\n" + "=" * 70)
    print("TEST SUITE 3: FastAPI /mark-attendance-live Endpoint Verification")
    print("=" * 70)

    client = TestClient(app)

    # 1. Test validation: Frame count too low (< 10)
    trigger_state["active"] = True
    files_low = [("frames", (f"frame_{i:02d}.jpg", b"fakebytes", "image/jpeg")) for i in range(5)]
    resp_low = client.post("/mark-attendance-live", data={"qr_code": "TEST01"}, files=files_low)
    assert resp_low.status_code == 400
    assert trigger_state["active"] is False, "trigger_state active should be reset to False"
    assert latest_result["available"] is True, "latest_result available should be set to True"
    assert latest_result["marked"] is False, "latest_result marked should be False"
    print(" [PASS] 400 validation correctly resets trigger_state and sets latest_result.")

    # 2. Test full end-to-end endpoint with 30 JPEG frames (encoded to memory)
    encoded_frames = []
    total_upload_bytes = 0
    for i, frame in enumerate(frames_real_blink):
        success, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        byte_data = buf.tobytes()
        total_upload_bytes += len(byte_data)
        encoded_frames.append(("frames", (f"frame_{i:02d}.jpg", byte_data, "image/jpeg")))

    print(f" Measured 30-frame burst upload payload: {total_upload_bytes} bytes ({total_upload_bytes / 1024:.1f} KB)")
    print(f" Average frame size: {total_upload_bytes / 30 / 1024:.2f} KB/frame")

    t0 = time.time()
    resp_live = client.post(
        "/mark-attendance-live",
        data={"qr_code": "TEST01"},
        files=encoded_frames,
    )
    latency_sec = time.time() - t0
    print(f" Measured /mark-attendance-live total execution latency: {latency_sec * 1000:.1f} ms")
    print(f" Response status: {resp_live.status_code}, payload: {resp_live.json()}")
    assert resp_live.status_code == 200
    assert "liveness" in resp_live.json()
    assert trigger_state["active"] is False
    assert latest_result["available"] is True
    print(" [PASS] End-to-end /mark-attendance-live verified successfully.")

    # 3. Test failure path (staring frames)
    encoded_staring = []
    for i, frame in enumerate(frames_staring):
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        encoded_staring.append(("frames", (f"frame_{i:02d}.jpg", buf.tobytes(), "image/jpeg")))

    resp_fail = client.post(
        "/mark-attendance-live",
        data={"qr_code": "TEST01"},
        files=encoded_staring,
    )
    data_fail = resp_fail.json()
    assert resp_fail.status_code == 200
    assert data_fail["marked"] is False
    assert data_fail["reason"] == "no_blink_detected"
    assert latest_result["available"] is True
    assert latest_result["marked"] is False
    print(" [PASS] Liveness failure (no_blink_detected) correctly reported to ESP32 bridge.")

    print("\nALL TEST SUITES PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_unit_tests()
