"""
Resilient Multi-Engine QR Code Decoder.

Optimized for small, blurry, tilted, or low-contrast QR codes on ID cards:
  1. Engine 1: WeChatQRCode (OpenCV) — Deep Learning enhanced, robust against small/distorted codes
  2. Engine 2: PyZBar (ZBar) — Industry standard barcode/QR decoder
  3. Engine 3: cv2.QRCodeDetector — Standard fallback

Multi-scale search strategy:
  - Pass 1: Raw full image
  - Pass 2: 2.0x Super-sampling (Bicubic upscaling for small QR grids)
  - Pass 3: Center crop (65% ROI where cards are held, eliminating background clutter)
  - Pass 4: Center crop + 2.0x Zoom
  - Pass 5: Contrast Enhancement (CLAHE + Unsharp Masking for laminated card glare)
  - Pass 6: Enhanced Grayscale + 2.0x Zoom
"""

import logging
import cv2
import numpy as np

logger = logging.getLogger("qr")
logger.setLevel(logging.INFO)

# Optional import for pyzbar
try:
    from pyzbar import pyzbar
    HAS_PYZBAR = True
except ImportError:
    pyzbar = None
    HAS_PYZBAR = False

# Initialize WeChatQRCode if supported by OpenCV build
_wechat_detector = None
try:
    if hasattr(cv2, "wechat_qrcode_WeChatQRCode"):
        _wechat_detector = cv2.wechat_qrcode_WeChatQRCode()
except Exception as e:
    logger.warning(f"Could not initialize WeChatQRCode: {e}")
    _wechat_detector = None

_cv2_detector = cv2.QRCodeDetector()


def _decode_with_engines(img: np.ndarray) -> str | None:
    """Tries all available decoders on a single image variant."""
    # 1. WeChatQRCode
    if _wechat_detector is not None:
        try:
            results, _ = _wechat_detector.detectAndDecode(img)
            if results and len(results) > 0 and results[0].strip():
                return results[0].strip()
        except Exception:
            pass

    # 2. PyZBar
    if HAS_PYZBAR:
        try:
            barcodes = pyzbar.decode(img, symbols=[pyzbar.ZBarSymbol.QRCODE])
            for b in barcodes:
                text = b.data.decode("utf-8", errors="ignore").strip()
                if text:
                    return text
        except Exception:
            pass

    # 3. Standard OpenCV QRCodeDetector
    try:
        data, _, _ = _cv2_detector.detectAndDecode(img)
        if data and data.strip():
            return data.strip()
    except Exception:
        pass

    return None


def decode_qr(img_bgr: np.ndarray) -> str | None:
    """
    Decodes QR code with multi-scale, center-crop, and contrast enhancement passes.
    Returns decoded string or None if unreadable.
    """
    if img_bgr is None or img_bgr.size == 0:
        return None

    # Pass 1: Direct full frame
    res = _decode_with_engines(img_bgr)
    if res:
        return res

    h, w = img_bgr.shape[:2]

    # Pass 2: 2.0x Upscaling (crucial for small QR codes)
    upscaled = cv2.resize(img_bgr, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    res = _decode_with_engines(upscaled)
    if res:
        return res

    # Pass 3: Center Crop (65% ROI where user holds the ID badge)
    ymin, ymax = int(h * 0.15), int(h * 0.85)
    xmin, xmax = int(w * 0.15), int(w * 0.85)
    center_roi = img_bgr[ymin:ymax, xmin:xmax]

    res = _decode_with_engines(center_roi)
    if res:
        return res

    # Pass 4: Center Crop + 2.0x Zoom
    center_zoomed = cv2.resize(center_roi, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    res = _decode_with_engines(center_zoomed)
    if res:
        return res

    # Pass 5: Contrast Enhancement (CLAHE for laminated card glare & shadows)
    gray = cv2.cvtColor(center_roi, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced_gray = clahe.apply(gray)
    enhanced_bgr = cv2.cvtColor(enhanced_gray, cv2.COLOR_GRAY2BGR)

    res = _decode_with_engines(enhanced_bgr)
    if res:
        return res

    # Pass 6: Enhanced Grayscale + 2.0x Zoom
    enhanced_zoomed = cv2.resize(enhanced_bgr, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    res = _decode_with_engines(enhanced_zoomed)
    if res:
        return res

    return None
