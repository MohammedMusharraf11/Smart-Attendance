import cv2
import glob
import sys
from pathlib import Path

# Add attendance-backend to sys.path
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

for i, frame in enumerate(frames):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = detector.detect(mp_img)
    if res.face_landmarks and res.face_blendshapes:
        lm = res.face_landmarks[0]
        blendshapes = {b.category_name: b.score for b in res.face_blendshapes[0]}
        blink_l = blendshapes.get("eyeBlinkLeft", 0.0)
        blink_r = blendshapes.get("eyeBlinkRight", 0.0)
        
        # EAR
        right_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [33, 160, 158, 133, 153, 144]]
        left_pts = [(lm[idx].x * w, lm[idx].y * h) for idx in [362, 385, 387, 263, 373, 380]]
        ear = (calculate_ear(right_pts) + calculate_ear(left_pts)) / 2.0
        
        print(f"Frame {i:02d}: EAR={ear:.4f} | blink_L={blink_l:.3f}, blink_R={blink_r:.3f}, max_blink={max(blink_l, blink_r):.3f}")
