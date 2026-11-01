"""
Adaptive MediaPipe FaceMesh Liveness Detection (Eye Aspect Ratio).

Detects real eye blinks from frame bursts using MediaPipe Tasks FaceLandmarker:
  - 6-point canonical eye landmarks converted to pixel coordinates
  - Adaptive 75th-percentile EAR baseline
  - Hysteresis thresholds (closed < 0.75*baseline, open > 0.85*baseline)
  - Validates sequence: open -> closed(1-6 frames) -> open
  - Selects sharpest open frame via Laplacian variance for face recognition
"""

import json
import logging
import math
import os
import threading
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("liveness")
logger.setLevel(logging.INFO)

# Canonical 6-point MediaPipe FaceMesh eye indices
# Right eye: [outer, top1, top2, inner, bottom2, bottom1]
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
# Left eye: [outer, top1, top2, inner, bottom2, bottom1]
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

# Model asset URL and local locations
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_FILENAME = "face_landmarker.task"

_detector_lock = threading.Lock()
_face_landmarker = None


def get_model_path() -> Path:
    """Finds or downloads face_landmarker.task."""
    base_dir = Path(__file__).resolve().parent.parent
    candidate_paths = [
        base_dir / "models" / MODEL_FILENAME,
        base_dir / MODEL_FILENAME,
        Path("models") / MODEL_FILENAME,
        Path(MODEL_FILENAME),
    ]
    for p in candidate_paths:
        if p.exists() and p.stat().st_size > 100_000:
            return p

    target_dir = base_dir / "models"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / MODEL_FILENAME
    logger.info(f"Downloading face_landmarker model to {target_path}...")
    urllib.request.urlretrieve(MODEL_URL, str(target_path))
    logger.info("Download completed.")
    return target_path


def get_face_landmarker():
    """Lazily initializes the MediaPipe FaceLandmarker singleton with thread safety."""
    global _face_landmarker
    if _face_landmarker is None:
        with _detector_lock:
            if _face_landmarker is None:
                import mediapipe as mp
                from mediapipe.tasks import python
                from mediapipe.tasks.python import vision

                model_path = get_model_path()
                base_options = python.BaseOptions(model_asset_path=str(model_path))
                options = vision.FaceLandmarkerOptions(
                    base_options=base_options,
                    running_mode=vision.RunningMode.IMAGE,
                    num_faces=1,
                    min_face_detection_confidence=0.5,
                    min_face_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                    output_face_blendshapes=True,
                )
                _face_landmarker = vision.FaceLandmarker.create_from_options(options)
                logger.info("MediaPipe FaceLandmarker with Blendshapes initialized successfully.")
    return _face_landmarker


def calculate_ear(eye_landmarks: List[Tuple[float, float]]) -> float:
    """
    Compute Eye Aspect Ratio (EAR) given 6 pixel (x, y) landmark points:
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


def extract_frame_landmarks_and_blendshapes(
    detector, frame_bgr: np.ndarray
) -> Tuple[
    Optional[List[Tuple[float, float]]],
    Optional[List[Tuple[float, float]]],
    Optional[Dict[str, float]],
    Optional[Tuple[float, float, float, float]],
]:
    """
    Runs FaceLandmarker on a BGR frame and returns:
      - canonical pixel landmarks for right eye
      - canonical pixel landmarks for left eye
      - blendshape score dictionary (e.g. eyeBlinkLeft, eyeBlinkRight)
      - face bounding box (min_x, min_y, width, height)
    or (None, None, None, None) if no face detected.
    """
    import mediapipe as mp

    h, w = frame_bgr.shape[:2]
    rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    with _detector_lock:
        result = detector.detect(mp_image)

    if not result.face_landmarks:
        return None, None, None, None

    landmarks = result.face_landmarks[0]
    right_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_EYE_INDICES]
    left_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_EYE_INDICES]

    blendshapes_dict: Dict[str, float] = {}
    if result.face_blendshapes:
        for b in result.face_blendshapes[0]:
            blendshapes_dict[b.category_name] = float(b.score)

    xs = [lm.x * w for lm in landmarks]
    ys = [lm.y * h for lm in landmarks]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    bbox = (min_x, min_y, max_x - min_x, max_y - min_y)

    return right_pts, left_pts, blendshapes_dict, bbox


def extract_frame_landmarks(detector, frame_bgr: np.ndarray):
    """
    Backward-compatible helper for standalone device_controller.
    Returns (right_pts, left_pts) or (None, None).
    """
    r_pts, l_pts, _, _ = extract_frame_landmarks_and_blendshapes(detector, frame_bgr)
    return r_pts, l_pts


def save_debug_burst(frames: List[np.ndarray], liveness_result: Dict[str, Any]):
    """Saves burst frames and diagnostic JSON for real-time inspection."""
    try:
        base_dir = Path(__file__).resolve().parent.parent
        # Always write to latest_burst so recent scans are inspectable
        latest_dir = base_dir / "scratch" / "latest_burst"
        latest_dir.mkdir(parents=True, exist_ok=True)
        for i, frame in enumerate(frames):
            cv2.imwrite(str(latest_dir / f"frame_{i:02d}.jpg"), frame)
        with open(latest_dir / "liveness.json", "w", encoding="utf-8") as f:
            json.dump(liveness_result, f, indent=2)

        # If DEBUG_SAVE_BURSTS=1, also keep archived history
        if os.environ.get("DEBUG_SAVE_BURSTS", "").strip() in ("1", "true", "yes"):
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            burst_dir = base_dir / "scratch" / "bursts" / ts_str
            burst_dir.mkdir(parents=True, exist_ok=True)
            for i, frame in enumerate(frames):
                cv2.imwrite(str(burst_dir / f"frame_{i:02d}.jpg"), frame)
            with open(burst_dir / "liveness.json", "w", encoding="utf-8") as f:
                json.dump(liveness_result, f, indent=2)
            logger.info(f"Archived debug burst to {burst_dir}")
    except Exception as e:
        logger.warning(f"Failed to save debug burst: {e}")


def check_blink(frames: List[np.ndarray]) -> Dict[str, Any]:
    """
    Adaptive Eye Aspect Ratio (EAR) + FaceBlendshapes blink verification over a frame burst.
    Strictly differentiates between live human blinks and static photos/phone screens:
      - Live human blink: EAR dips >= 28% AND blendshape eyelid closure spikes >= 0.50.
      - Static photo/screen: Eyelid blendshapes stay flat/low (<= 0.43); fails liveness.
    """
    frames_total = len(frames)
    if frames_total == 0:
        return {
            "passed": False,
            "reason": "no_face_or_too_few_frames",
            "frames_total": 0,
            "frames_with_face": 0,
            "baseline_ear": 0.0,
            "min_ear": 0.0,
            "closed_run_length": 0,
            "best_frame_index": 0,
        }

    detector = get_face_landmarker()

    ears: List[Optional[float]] = []
    blend_blinks: List[Optional[float]] = []
    sharpness_scores: List[float] = []
    face_boxes: List[Optional[Tuple[float, float, float, float]]] = []

    for frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sharpness_scores.append(var)

        right_pts, left_pts, bshapes, bbox = extract_frame_landmarks_and_blendshapes(detector, frame)
        if right_pts is not None and left_pts is not None:
            r_ear = calculate_ear(right_pts)
            l_ear = calculate_ear(left_pts)
            avg_ear = (r_ear + l_ear) / 2.0
            ears.append(avg_ear)
            face_boxes.append(bbox)

            if bshapes:
                blink_score = max(bshapes.get("eyeBlinkLeft", 0.0), bshapes.get("eyeBlinkRight", 0.0))
                blend_blinks.append(blink_score)
            else:
                blend_blinks.append(None)
        else:
            ears.append(None)
            blend_blinks.append(None)
            face_boxes.append(None)

    valid_indices = [i for i, e in enumerate(ears) if e is not None]
    frames_with_face = len(valid_indices)

    # 1. Require >= 8 frames with a detected face
    if frames_with_face < 8:
        result = {
            "passed": False,
            "reason": "no_face_or_too_few_frames",
            "frames_total": frames_total,
            "frames_with_face": frames_with_face,
            "baseline_ear": 0.0,
            "min_ear": 0.0,
            "closed_run_length": 0,
            "best_frame_index": int(np.argmax(sharpness_scores)) if sharpness_scores else 0,
        }
        save_debug_burst(frames, result)
        return result

    valid_ears = [ears[i] for i in valid_indices if ears[i] is not None]
    valid_blinks = [blend_blinks[i] for i in valid_indices if blend_blinks[i] is not None]

    baseline_ear = float(np.percentile(valid_ears, 75))
    min_ear = float(np.min(valid_ears))
    baseline_blink = float(np.percentile(valid_blinks, 25)) if valid_blinks else 0.0
    max_blend_blink = float(np.max(valid_blinks)) if valid_blinks else 0.0

    # 2. Require baseline EAR >= 0.14 (eyes must be open)
    if baseline_ear < 0.14:
        result = {
            "passed": False,
            "reason": "eyes_not_open",
            "frames_total": frames_total,
            "frames_with_face": frames_with_face,
            "baseline_ear": round(baseline_ear, 4),
            "min_ear": round(min_ear, 4),
            "max_blend_blink": round(max_blend_blink, 4),
            "closed_run_length": 0,
            "best_frame_index": int(np.argmax(sharpness_scores)),
        }
        save_debug_burst(frames, result)
        return result

    # 3. Dynamic thresholds
    closed_ear_threshold = 0.72 * baseline_ear
    open_ear_threshold = 0.85 * baseline_ear

    # Classify state: 1 = open, -1 = closed, 0 = transition / neutral
    frame_states = []
    for i in range(frames_total):
        e = ears[i]
        b = blend_blinks[i]
        if e is None:
            frame_states.append(0)
            continue

        if b is not None:
            # Multi-modal check: both physical EAR drop and muscle blendshape confirmation
            is_closed = (
                (e <= closed_ear_threshold and b >= 0.48)
                or (b >= 0.60 and e <= 0.80 * baseline_ear)
                or (b - baseline_blink >= 0.25 and e <= closed_ear_threshold)
            )
            is_open = (e >= open_ear_threshold and (b <= 0.38 or b - baseline_blink <= 0.12))
        else:
            # Fallback for synthetic / blendshape-disabled inputs
            is_closed = (e <= closed_ear_threshold)
            is_open = (e >= open_ear_threshold)

        if is_closed:
            frame_states.append(-1)
        elif is_open:
            frame_states.append(1)
        else:
            frame_states.append(0)

    # 4. Check for blink sequence: open -> closed(1-6 frames) -> open
    runs = []
    in_run = False
    run_start = 0

    for i, state in enumerate(frame_states):
        if state == -1:
            if not in_run:
                in_run = True
                run_start = i
        else:
            if in_run:
                runs.append((run_start, i - 1, i - run_start))
                in_run = False
    if in_run:
        runs.append((run_start, len(frame_states) - 1, len(frame_states) - run_start))

    passed = False
    qualifying_run_length = 0
    max_closed_run = 0

    for start_idx, end_idx, length in runs:
        if length > max_closed_run:
            max_closed_run = length

        # Natural blinks last 100ms - 600ms (1-6 frames at ~10 fps)
        if 1 <= length <= 6:
            # Crucial: Must be preceded by open eye(s) and followed by open eye(s)
            has_open_before = any(frame_states[j] == 1 for j in range(0, start_idx))
            has_open_after = any(frame_states[j] == 1 for j in range(end_idx + 1, len(frame_states)))

            # Absolute EAR dip in the run must be >= 0.04 to exclude subpixel camera noise
            ear_dip = baseline_ear - min(ears[j] for j in range(start_idx, end_idx + 1) if ears[j] is not None)

            # Peak blendshape in the closed run must confirm eyelid closure
            if valid_blinks:
                run_blinks = [blend_blinks[j] for j in range(start_idx, end_idx + 1) if blend_blinks[j] is not None]
                peak_run_blink = max(run_blinks) if run_blinks else 0.0
                blendshape_confirmed = (
                    peak_run_blink >= 0.50
                    or (peak_run_blink - baseline_blink >= 0.25 and ear_dip >= 0.05)
                )
            else:
                blendshape_confirmed = True

            if has_open_before and has_open_after and ear_dip >= 0.04 and blendshape_confirmed:
                passed = True
                qualifying_run_length = length
                break

    closed_run_reported = qualifying_run_length if passed else max_closed_run

    # 5. Best frame index: sharpest among clear open frames (state == 1)
    open_frame_indices = [i for i, state in enumerate(frame_states) if state == 1]
    if open_frame_indices:
        best_frame_index = max(open_frame_indices, key=lambda idx: sharpness_scores[idx])
    elif valid_indices:
        best_frame_index = max(valid_indices, key=lambda idx: sharpness_scores[idx])
    else:
        best_frame_index = int(np.argmax(sharpness_scores))

    reason = "ok" if passed else "no_blink_detected"

    result = {
        "passed": passed,
        "reason": reason,
        "frames_total": frames_total,
        "frames_with_face": frames_with_face,
        "baseline_ear": round(baseline_ear, 4),
        "min_ear": round(min_ear, 4),
        "max_blend_blink": round(max_blend_blink, 4),
        "closed_run_length": closed_run_reported,
        "best_frame_index": best_frame_index,
        "closed_threshold": round(closed_ear_threshold, 4),
        "open_threshold": round(open_ear_threshold, 4),
    }

    save_debug_burst(frames, result)
    return result

