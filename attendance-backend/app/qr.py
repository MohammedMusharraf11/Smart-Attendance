"""QR code decoding."""
import cv2
import numpy as np


def decode_qr(img_bgr: np.ndarray):
    detector = cv2.QRCodeDetector()
    data, points, _ = detector.detectAndDecode(img_bgr)
    return data.strip() if data else None
