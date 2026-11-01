import cv2
import glob
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.liveness import get_face_landmarker, calculate_ear
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Load the real static photo frames
photo_frames = [cv2.imread(f) for f in sorted(glob.glob("attendance-backend/scratch/latest_burst/frame_*.jpg"))]
print(f"Loaded {len(photo_frames)} static photo frames.")

def evaluate_burst(detector, frames):
    h, w = frames[0].shape[:2]
    ears = []
    blinks = []
    sharpness_scores = []
    
    for frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        sharpness_scores.append(float(cv2.Laplacian(gray, cv2.CV_64F).var()))
        
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = detector.detect(mp_img)
        if res.face_landmarks and res.face_blendshapes:
            lm = res.face_landmarks[0]
            scores = {b.category_name: b.score for b in res.face_blendshapes[0]}
            blink_val = max(scores.get("eyeBlinkLeft", 0.0), scores.get("eyeBlinkRight", 0.0))
            
            r_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [33, 160, 158, 133, 153, 144]]
            l_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [362, 385, 387, 263, 373, 380]]
            ear = (calculate_ear(r_pts) + calculate_ear(l_pts)) / 2.0
            
            ears.append(ear)
            blinks.append(blink_val)
        else:
            ears.append(None)
            blinks.append(None)
            
    valid_indices = [i for i, e in enumerate(ears) if e is not None]
    if len(valid_indices) < 8:
        return {"passed": False, "reason": "no_face_or_too_few_frames"}
        
    valid_ears = [ears[i] for i in valid_indices]
    baseline_ear = float(np.percentile(valid_ears, 75))
    min_ear = float(np.min(valid_ears))
    
    if baseline_ear < 0.14:
        return {"passed": False, "reason": "eyes_not_open"}
        
    # Adaptive EAR thresholds
    closed_ear_thresh = 0.72 * baseline_ear
    open_ear_thresh = 0.85 * baseline_ear
    
    # State classification:
    # 1: Open, -1: Closed, 0: Transition
    states = []
    for i in range(len(frames)):
        e = ears[i]
        b = blinks[i]
        if e is None or b is None:
            states.append(0)
            continue
            
        # Closed requires eyelid blendshape confirmation (>= 0.50) OR strong blendshape (>= 0.60)
        # and physical EAR drop
        is_closed = (e <= closed_ear_thresh and b >= 0.48) or (b >= 0.60 and e <= 0.80 * baseline_ear)
        is_open = (e >= open_ear_thresh and b <= 0.38)
        
        if is_closed:
            states.append(-1)
        elif is_open:
            states.append(1)
        else:
            states.append(0)
            
    # Find closed runs
    runs = []
    in_run = False
    run_start = 0
    for i, s in enumerate(states):
        if s == -1:
            if not in_run:
                in_run = True
                run_start = i
        else:
            if in_run:
                runs.append((run_start, i - 1, i - run_start))
                in_run = False
    if in_run:
        runs.append((run_start, len(states) - 1, len(states) - run_start))
        
    passed = False
    qualifying_run = 0
    max_closed_run = 0
    
    for start_idx, end_idx, length in runs:
        if length > max_closed_run:
            max_closed_run = length
        if 1 <= length <= 6:
            # Must have open frame before and open frame after
            has_open_before = any(states[j] == 1 for j in range(0, start_idx))
            has_open_after = any(states[j] == 1 for j in range(end_idx + 1, len(states)))
            
            # Peak blendshape in the closed run must reach >= 0.52
            peak_b = max(blinks[j] for j in range(start_idx, end_idx + 1) if blinks[j] is not None)
            
            # EAR dip must be meaningful (>= 0.04 drop)
            ear_dip = baseline_ear - min(ears[j] for j in range(start_idx, end_idx + 1) if ears[j] is not None)
            
            if has_open_before and has_open_after and peak_b >= 0.52 and ear_dip >= 0.04:
                passed = True
                qualifying_run = length
                break
                
    return {
        "passed": passed,
        "reason": "ok" if passed else "no_blink_detected",
        "baseline_ear": round(baseline_ear, 4),
        "min_ear": round(min_ear, 4),
        "closed_run_length": qualifying_run if passed else max_closed_run,
        "states": states,
    }

from app.liveness import get_face_landmarker
detector = get_face_landmarker()
# We need detector to have output_face_blendshapes=True
from app.liveness import get_model_path
opts = vision.FaceLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path=str(get_model_path())),
    running_mode=vision.RunningMode.IMAGE,
    num_faces=1,
    output_face_blendshapes=True,
)
detector_bs = vision.FaceLandmarker.create_from_options(opts)

res = evaluate_burst(detector_bs, photo_frames)
print(f"Static photo result: passed={res['passed']}, reason={res['reason']}")

