"""Vector DB wrapper (Chroma) for enrolled face embeddings."""
import chromadb
import numpy as np

_client = None
_collection = None


def get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path="./data/chroma_db")
        # cosine space so distances map directly to similarity (1 - distance)
        _collection = _client.get_or_create_collection(
            name="faces",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def enroll_embedding(code: str, name: str, embedding: np.ndarray) -> str:
    """Adds one more embedding for a code (multiple images per student are expected)."""
    col = get_collection()
    existing = col.get(where={"code": code})
    idx = len(existing["ids"]) if existing and existing.get("ids") else 0
    new_id = f"{code}__{idx}"
    col.add(
        ids=[new_id],
        embeddings=[embedding.tolist()],
        metadatas=[{"code": code, "name": name}],
    )
    return new_id


def query_best_match(embedding: np.ndarray, top_k: int = 5):
    """Returns (best_code, best_name, best_similarity) or (None, None, 0.0) if the DB is empty."""
    col = get_collection()
    count = col.count()
    if count == 0:
        return None, None, 0.0

    result = col.query(query_embeddings=[embedding.tolist()], n_results=min(top_k, count))
    metadatas = result["metadatas"][0]
    distances = result["distances"][0]

    best_code, best_name, best_score = None, None, -1.0
    for dist, meta in zip(distances, metadatas):
        sim = 1 - dist  # cosine space: distance = 1 - cosine_similarity
        if sim > best_score:
            best_score = sim
            best_code = meta["code"]
            best_name = meta.get("name")
    return best_code, best_name, best_score


def list_students():
    """Returns one summary row per enrolled code: {code, name, image_count}."""
    col = get_collection()
    all_entries = col.get()
    summary = {}
    for meta in all_entries.get("metadatas", []):
        code = meta.get("code")
        if code not in summary:
            summary[code] = {"code": code, "name": meta.get("name"), "image_count": 0}
        summary[code]["image_count"] += 1
    return list(summary.values())


def delete_student(code: str) -> int:
    """Removes all enrolled embeddings for a code. Returns how many were deleted."""
    col = get_collection()
    existing = col.get(where={"code": code})
    ids = existing.get("ids", [])
    if ids:
        col.delete(ids=ids)
    return len(ids)
