import cv2
import glob
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.liveness import get_model_path, extract_frame_landmarks, calculate_ear
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

model_path = get_model_path()
base_options = python.BaseOptions(model_asset_path=str(model_path))
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.IMAGE,
    num_faces=1,
    output_face_blendshapes=True,
)
detector = vision.FaceLandmarker.create_from_options(options)

frames = [cv2.imread(f) for f in sorted(glob.glob("attendance-backend/scratch/latest_burst/frame_*.jpg"))]
h, w = frames[0].shape[:2]

ears = []
blend_blinks = []
valid_frames = []

for i, frame in enumerate(frames):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = detector.detect(mp_img)
    if res.face_landmarks and res.face_blendshapes:
        lm = res.face_landmarks[0]
        blendshapes = {b.category_name: b.score for b in res.face_blendshapes[0]}
        blink_l = blendshapes.get("eyeBlinkLeft", 0.0)
        blink_r = blendshapes.get("eyeBlinkRight", 0.0)
        max_b = max(blink_l, blink_r)
        
        right_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [33, 160, 158, 133, 153, 144]]
        left_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [362, 385, 387, 263, 373, 380]]
        ear = (calculate_ear(right_pts) + calculate_ear(left_pts)) / 2.0
        
        ears.append(ear)
        blend_blinks.append(max_b)
        valid_frames.append(i)
    else:
        ears.append(None)
        blend_blinks.append(None)

valid_ears = [e for e in ears if e is not None]
baseline_ear = np.percentile(valid_ears, 75)
min_ear = np.min(valid_ears)

print(f"Total valid frames: {len(valid_ears)}/{len(frames)}")
print(f"Baseline EAR: {baseline_ear:.4f}, Min EAR: {min_ear:.4f}")
print(f"Max blendshape blink across all frames: {max(b for b in blend_blinks if b is not None):.4f}")

# Test classification
closed_threshold = 0.70 * baseline_ear
open_threshold = 0.85 * baseline_ear

states = []
for i in range(len(frames)):
    e = ears[i]
    b = blend_blinks[i]
    if e is None or b is None:
        states.append(0)
    # Closed requires BOTH EAR drop and elevated blendshape blink
    elif e <= closed_threshold and b >= 0.55:
        states.append(-1)
    elif e >= open_threshold and b <= 0.40:
        states.append(1)
    else:
        states.append(0)

print("States (-1=closed, 1=open, 0=neutral):")
print(states)

# Check sequence open -> closed(1-6) -> open
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
for start_idx, end_idx, length in runs:
    if 1 <= length <= 6:
        has_open_before = any(states[j] == 1 for j in range(0, start_idx))
        has_open_after = any(states[j] == 1 for j in range(end_idx + 1, len(states)))
        if has_open_before and has_open_after:
            passed = True
            break

print(f"Liveness passed on static photo? {passed}")

