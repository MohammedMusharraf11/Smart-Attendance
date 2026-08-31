"""Face embedding model — loads once, reused across requests."""
import numpy as np
from insightface.app import FaceAnalysis

_app = None


def get_model():
    """Lazily load the ArcFace model (buffalo_l). First call downloads ~350MB."""
    global _app
    if _app is None:
        _app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _app.prepare(ctx_id=0, det_size=(640, 640))
    return _app


def get_embedding(img_bgr: np.ndarray):
    """Returns a normalized 512-d embedding for the largest face in the image, or None."""
    faces = get_model().get(img_bgr)
    if not faces:
        return None
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
    emb = faces[0].embedding
    return (emb / np.linalg.norm(emb)).astype(np.float32)
