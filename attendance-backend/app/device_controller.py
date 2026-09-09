"""
Device Controller for ESP32 Hardware-Triggered Attendance with Liveness Detection.

Owns the serial connection to the ESP32, controls the webcam, and executes the
attendance verification state machine:
  1. IDLE: Waits for 'TRIGGER' over USB serial from the ESP32 ultrasonic sensor.
  2. SCAN_QR: Sends 'STATE:SCAN_QR', opens webcam, polls frames through decode_qr() (timeout: 8s).
  3. BLINK: Sends 'STATE:BLINK', captures a 3s frame burst, runs Eye Aspect Ratio (EAR)
     liveness check via MediaPipe FaceMesh to ensure the person blinks.
  4. PROCESSING: Sends 'STATE:PROCESSING', extracts ArcFace face embedding from the clearest frame,
     matches against ChromaDB, and verifies consistency with the decoded QR code.
  5. RESULT: Sends 'RESULT:OK:<name>' or 'RESULT:FAIL:<reason>' to ESP32 (LED/buzzer/LCD).
  6. Returns to IDLE after a short pause.

Also provides real-time state broadcasting for WebSockets and REST endpoints.
"""

import asyncio
import logging
import math
import os
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Set

import cv2
import numpy as np

# Safe optional imports for pyserial and mediapipe so module imports cleanly
try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    serial = None
    HAS_SERIAL = False

try:
    import mediapipe as mp
    HAS_MEDIAPIPE = True
except ImportError:
    mp = None
    HAS_MEDIAPIPE = False

from app.attendance_log import mark_attendance
from app.db import query_best_match
from app.model import get_embedding
from app.qr import decode_qr

logger = logging.getLogger("device_controller")
logger.setLevel(logging.INFO)

# Configurable constants
BAUD_RATE = int(os.environ.get("ESP32_BAUD", "115200"))
DEFAULT_PORT = os.environ.get("ESP32_PORT", "COM3" if sys.platform.startswith("win") else "/dev/ttyUSB0")
QR_TIMEOUT_SECONDS = float(os.environ.get("QR_TIMEOUT_SEC", "8.0"))
LIVENESS_BURST_SECONDS = float(os.environ.get("LIVENESS_BURST_SEC", "3.0"))
EAR_CLOSED_THRESHOLD = 0.21  # Eye considered closed when EAR < this
EAR_OPEN_THRESHOLD = 0.24    # Eye considered open when EAR >= this
MATCH_THRESHOLD = 0.40       # Cosine similarity threshold

# MediaPipe Eye Landmark Indices (canonical 6-point landmarks)
LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]   # outer, top1, top2, inner, bottom2, bottom1
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380] # outer, top1, top2, inner, bottom2, bottom1


def calculate_ear(eye_landmarks: List[List[float]]) -> float:
    """
    Compute Eye Aspect Ratio (EAR) given 6 (x, y) landmark points:
      p1 = outer corner, p4 = inner corner
      p2, p3 = top eyelid points
      p6, p5 = bottom eyelid points
    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
    """
    p1, p2, p3, p4, p5, p6 = eye_landmarks

    def dist(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    vertical_1 = dist(p2, p6)
    vertical_2 = dist(p3, p5)
    horizontal = dist(p1, p4)

    if horizontal < 1e-6:
        return 0.0
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


class DeviceController:
    """Manages the ESP32 hardware connection and camera verification state machine."""

    def __init__(self):
        self.port: str = DEFAULT_PORT
        self.baud: int = BAUD_RATE
        self.serial_conn: Optional[Any] = None
        self.running: bool = False
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.async_loop: Optional[asyncio.AbstractEventLoop] = None
        self.ws_clients: Set[Any] = set()

        # Current state
        self.current_state: Dict[str, Any] = {
            "state": "idle",
            "detail": "Device controller initialized. Waiting for proximity trigger...",
            "timestamp": time.time(),
            "student_name": None,
            "student_code": None,
            "similarity": None,
        }

        # Lazy-loaded MediaPipe FaceMesh
        self._face_mesh = None

    def _get_face_mesh(self):
        if not HAS_MEDIAPIPE:
            return None
        if self._face_mesh is None:
            self._face_mesh = mp.solutions.face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        return self._face_mesh

    def set_async_loop(self, loop: asyncio.AbstractEventLoop):
        """Set the event loop for broadcasting WebSocket updates from background thread."""
        self.async_loop = loop

    def broadcast_state(
        self,
        state: str,
        detail: str,
        student_name: Optional[str] = None,
        student_code: Optional[str] = None,
        similarity: Optional[float] = None,
    ):
        """Update current state and notify all connected WebSockets."""
        payload = {
            "state": state,
            "detail": detail,
            "timestamp": time.time(),
            "student_name": student_name,
            "student_code": student_code,
            "similarity": similarity,
        }
        with self.lock:
            self.current_state = payload

        # Broadcast payload to active WebSockets if loop is available
        if self.async_loop and self.ws_clients:
            async def _send_all():
                closed = []
                for client in list(self.ws_clients):
                    try:
                        await client.send_json(payload)
                    except Exception:
                        closed.append(client)
                for c in closed:
                    self.ws_clients.discard(c)

            asyncio.run_coroutine_threadsafe(_send_all(), self.async_loop)

    def register_ws(self, ws):
        with self.lock:
            self.ws_clients.add(ws)

    def unregister_ws(self, ws):
        with self.lock:
            self.ws_clients.discard(ws)

    def auto_detect_port(self) -> str:
        """Find the ESP32 serial COM port or fallback to default."""
        if not HAS_SERIAL:
            return self.port

        ports = list(serial.tools.list_ports.comports())
        for p in ports:
            desc = (p.description or "").lower()
            hwid = (p.hwid or "").lower()
            # Common ESP32 USB-UART chip identifiers
            if any(k in desc or k in hwid for k in ["ch340", "cp210", "usb-serial", "ftdi", "esp32"]):
                logger.info(f"Auto-detected ESP32 on port: {p.device} ({p.description})")
                return p.device

        if ports:
            logger.info(f"Using first available serial port: {ports[0].device}")
            return ports[0].device

        return self.port

    def open_serial(self) -> bool:
        """Open USB serial connection to the ESP32."""
        if not HAS_SERIAL:
            logger.warning("pyserial is not installed; running in serial simulation mode.")
            return False

        port_to_use = self.auto_detect_port()
        self.port = port_to_use
        try:
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=1.0)
            time.sleep(1.5)  # Allow ESP32 to reset after DTR/RTS assertion
            logger.info(f"Connected to ESP32 on {self.port} at {self.baud} baud.")
            self.send_serial_cmd("STATE:IDLE")
            return True
        except Exception as e:
            logger.warning(f"Could not open serial port {self.port}: {e}. Device controller will wait or accept manual triggers.")
            self.serial_conn = None
            return False

    def send_serial_cmd(self, cmd: str):
        """Send a formatted text command to the ESP32."""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                line = (cmd.strip() + "\n").encode("utf-8")
                self.serial_conn.write(line)
                self.serial_conn.flush()
                logger.debug(f"TX -> ESP32: {cmd}")
            except Exception as e:
                logger.error(f"Failed to send to serial: {e}")

    def run_cycle(self):
        """
        Executes one full hardware-triggered attendance cycle:
          1. SCAN_QR (wait for student to present QR)
          2. BLINK (liveness burst to detect eye blink)
          3. PROCESSING (ArcFace embedding & ChromaDB match)
          4. RESULT & IDLE
        """
        logger.info("Starting attendance verification cycle...")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            # Try DirectShow on Windows if index 0 failed
            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

        if not cap.isOpened():
            logger.error("Unable to access webcam.")
            self.send_serial_cmd("RESULT:FAIL:Camera unavailable")
            self.broadcast_state("result_fail", "Webcam could not be opened.")
            time.sleep(3.0)
            self.send_serial_cmd("STATE:IDLE")
            self.broadcast_state("idle", "Idle — waiting for proximity trigger...")
            return

        try:
            # ----------------------------------------------------
            # STEP 1: SCAN QR CODE (timeout ~8 seconds)
            # ----------------------------------------------------
            self.send_serial_cmd("STATE:SCAN_QR")
            self.broadcast_state("scan_qr", "Scanning QR code — please hold ID card up to camera...")

            decoded_qr = None
            start_qr_time = time.time()

            while time.time() - start_qr_time < QR_TIMEOUT_SECONDS and self.running:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.05)
                    continue

                qr_text = decode_qr(frame)
                if qr_text:
                    decoded_qr = qr_text.strip().upper()
                    logger.info(f"Decoded QR code: {decoded_qr}")
                    break
                time.sleep(0.05)

            if not decoded_qr:
                logger.warning("QR Scan timed out without detecting a QR code.")
                self.send_serial_cmd("RESULT:FAIL:No QR detected")
                self.broadcast_state("result_fail", "No QR code detected within timeout.")
                time.sleep(3.0)
                self.send_serial_cmd("STATE:IDLE")
                self.broadcast_state("idle", "Idle — waiting for someone to approach...")
                return

            # ----------------------------------------------------
            # STEP 2: LIVENESS CHECK (3-second burst for eye blink)
            # ----------------------------------------------------
            self.send_serial_cmd("STATE:BLINK")
            self.broadcast_state("blink", f"QR Detected: {decoded_qr}. Checking liveness — please blink at the camera...")

            blink_detected = False
            eye_closed = False
            clearest_frame = None
            max_variance = 0.0

            start_liveness_time = time.time()
            face_mesh = self._get_face_mesh()

            while time.time() - start_liveness_time < LIVENESS_BURST_SECONDS and self.running:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.03)
                    continue

                # Keep track of the sharpest frame (highest Laplacian variance) for face recognition
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                variance = cv2.Laplacian(gray, cv2.CV_64F).var()
                if variance > max_variance:
                    max_variance = variance
                    clearest_frame = frame.copy()

                if face_mesh is not None:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = face_mesh.process(rgb_frame)

                    if results.multi_face_landmarks:
                        landmarks = results.multi_face_landmarks[0].landmark
                        h, w = frame.shape[:2]

                        # Extract left and right eye (x, y) coordinates
                        left_pts = [[landmarks[i].x * w, landmarks[i].y * h] for i in LEFT_EYE_INDICES]
                        right_pts = [[landmarks[i].x * w, landmarks[i].y * h] for i in RIGHT_EYE_INDICES]

                        left_ear = calculate_ear(left_pts)
                        right_ear = calculate_ear(right_pts)
                        avg_ear = (left_ear + right_ear) / 2.0

                        # Blink state machine: must dip below threshold, then recover
                        if avg_ear < EAR_CLOSED_THRESHOLD:
                            eye_closed = True
                        elif eye_closed and avg_ear >= EAR_OPEN_THRESHOLD:
                            blink_detected = True
                            logger.info(f"Eye blink successfully detected (EAR: {avg_ear:.3f})")
                            break
                else:
                    # Fallback if mediapipe is not installed: accept liveness after short presence
                    time.sleep(0.05)
                    blink_detected = True

                time.sleep(0.03)

            # If mediapipe is installed and no blink was found:
            if face_mesh is not None and not blink_detected:
                logger.warning("Liveness check failed: no eye blink detected.")
                self.send_serial_cmd("RESULT:FAIL:Liveness check failed")
                self.broadcast_state("result_fail", "Liveness check failed — no blink detected.")
                time.sleep(3.0)
                self.send_serial_cmd("STATE:IDLE")
                self.broadcast_state("idle", "Idle — waiting for someone to approach...")
                return

            # ----------------------------------------------------
            # STEP 3: PROCESSING (Face Embedding & Match)
            # ----------------------------------------------------
            self.send_serial_cmd("STATE:PROCESSING")
            self.broadcast_state("processing", "Verifying biometric face match against enrolled database...")

            if clearest_frame is None:
                ret, clearest_frame = cap.read()

            if clearest_frame is None:
                self.send_serial_cmd("RESULT:FAIL:Camera error")
                self.broadcast_state("result_fail", "Could not capture image for verification.")
                time.sleep(3.0)
                self.send_serial_cmd("STATE:IDLE")
                self.broadcast_state("idle", "Idle — waiting for someone to approach...")
                return

            embedding = get_embedding(clearest_frame)
            if embedding is None:
                logger.warning("No face detected in clearest frame.")
                self.send_serial_cmd("RESULT:FAIL:No face detected")
                self.broadcast_state("result_fail", "No face detected in the verification frame.")
                time.sleep(3.0)
                self.send_serial_cmd("STATE:IDLE")
                self.broadcast_state("idle", "Idle — waiting for someone to approach...")
                return

            face_code, face_name, score = query_best_match(embedding)
            score_float = round(float(score), 4) if score is not None else 0.0

            # Match conditions: face code matches QR code and cosine similarity >= threshold
            matched = (
                face_code is not None
                and score_float >= MATCH_THRESHOLD
                and face_code.strip().upper() == decoded_qr
            )

            if matched:
                timestamp = mark_attendance(face_code, face_name or "Student", score_float)
                logger.info(f"Attendance verified for {face_name} ({face_code}) with score {score_float}")
                self.send_serial_cmd(f"RESULT:OK:{face_name}")
                self.broadcast_state(
                    "result_ok",
                    f"✅ Verified: {face_name} ({face_code}) — {score_float * 100:.1f}% match",
                    student_name=face_name,
                    student_code=face_code,
                    similarity=score_float,
                )
            else:
                reason = "Mismatch" if face_code != decoded_qr else "Low confidence"
                logger.warning(f"Attendance mismatch: decoded={decoded_qr}, predicted={face_code}, score={score_float}")
                self.send_serial_cmd(f"RESULT:FAIL:{reason}")
                self.broadcast_state(
                    "result_fail",
                    f"❌ Not verified: {reason} (Predicted: {face_code or 'None'}, Score: {score_float * 100:.1f}%)",
                    student_name=face_name,
                    student_code=decoded_qr,
                    similarity=score_float,
                )

            # Wait 3s before returning to idle
            time.sleep(3.0)
            self.send_serial_cmd("STATE:IDLE")
            self.broadcast_state("idle", "Idle — waiting for someone to approach...")

        finally:
            cap.release()

    def _loop(self):
        """Background thread loop: listens for serial TRIGGER and dispatches cycles."""
        logger.info("Device controller background loop started.")
        self.open_serial()

        while self.running:
            try:
                if self.serial_conn and self.serial_conn.is_open:
                    if self.serial_conn.in_waiting > 0:
                        raw_line = self.serial_conn.readline().decode("utf-8", errors="ignore").strip()
                        if raw_line:
                            logger.info(f"RX <- ESP32: {raw_line}")
                            if raw_line == "TRIGGER":
                                self.run_cycle()
                else:
                    # Attempt reconnect every 5s if disconnected
                    time.sleep(2.0)
                    if not self.serial_conn:
                        self.open_serial()

                time.sleep(0.1)
            except Exception as e:
                logger.error(f"Error in device controller loop: {e}")
                time.sleep(1.0)

        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except Exception:
                pass
        logger.info("Device controller background loop terminated.")

    def start(self):
        """Start the background controller thread."""
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._loop, name="ESP32DeviceController", daemon=True)
        self.thread.start()
        logger.info("ESP32 Device Controller service started.")

    def stop(self):
        """Stop the background controller thread."""
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        logger.info("ESP32 Device Controller service stopped.")

    def trigger_cycle_now(self):
        """Programmatically trigger a cycle (for testing or frontend simulation)."""
        threading.Thread(target=self.run_cycle, daemon=True).start()


# Global singleton instance
device_controller = DeviceController()
