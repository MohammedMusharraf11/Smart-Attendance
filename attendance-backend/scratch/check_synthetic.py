import sys
from pathlib import Path
import cv2
import numpy as np

sys.path.insert(0, "attendance-backend")

from app.liveness import get_face_landmarker, calculate_ear, get_model_path
from scratch.test_liveness_suite import create_synthetic_face_frame
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

opts = vision.FaceLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path=str(get_model_path())),
    running_mode=vision.RunningMode.IMAGE,
    num_faces=1,
    output_face_blendshapes=True,
)
detector = vision.FaceLandmarker.create_from_options(opts)

# Test 1: Synthetic real blink
frames_real_blink = []
for _ in range(12):
    frames_real_blink.append(create_synthetic_face_frame(ear_target=0.28))
for _ in range(3):
    frames_real_blink.append(create_synthetic_face_frame(ear_target=0.05))
for _ in range(15):
    frames_real_blink.append(create_synthetic_face_frame(ear_target=0.28))

import glob
photo_frames = [cv2.imread(f) for f in sorted(glob.glob("attendance-backend/scratch/latest_burst/frame_*.jpg"))]

print(f"Synthetic blink frames: {len(frames_real_blink)}, Photo frames: {len(photo_frames)}")

# Let's inspect blendshapes on synthetic closed face:
# Earlier we saw synthetic closed face had:
# Synthetic open blink: 0.002
# Synthetic closed blink: 0.29 - 0.39
# Why did synthetic face have 0.39? Because it's a flat cartoon drawing with no eyelashes or eyelid fold!

