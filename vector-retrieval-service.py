"""Local SigLIP2 shortlist for the production factory's approved project clips.

Run on the Windows host using the project-local portable Python environment.
Only asset IDs and compact titles cross the HTTP boundary; media stays local.
"""
import json
import os
from pathlib import Path
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import numpy as np

ROOT = Path(__file__).resolve().parent
ASSET_ROOT = Path(os.environ.get("BROLL_VECTOR_ASSET_ROOT", str(ROOT)))
DB = Path(os.environ.get("BROLL_VECTOR_DB", str(ROOT / "vector-index" / "local-clips.sqlite")))
MODEL = Path(os.environ.get(
    "BROLL_VECTOR_MODEL",
    str(ROOT / "runtime" / "vector-cache" / "models" / "hub"
        / "models--google--siglip2-base-patch16-224" / "snapshots"
        / "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"),
))
STOP = {"the", "and", "for", "with", "from", "video", "shot", "person", "people", "indian"}


def tokens(value):
    return {x for x in re.findall(r"[a-z]{3,}", value.casefold()) if x not in STOP}


SHOT_WINDOW_SECONDS = 3.0


def is_dense(times) -> bool:
    return len(times) > 1 and float(np.median(np.diff(times))) <= 1.5


def best_window(frame_scores, frame_times, window=SHOT_WINDOW_SECONDS):
    """Best mean score over a shot-length window; returns (start frame index, score).

    Dense (1 fps) indexes reward a clip whose matching action lasts a whole shot,
    not a single lucky frame. Sparse legacy indexes fall back to the best frame.
    """
    times = np.asarray(frame_times, dtype=float)
    if len(frame_scores) < 2 or len(times) != len(frame_scores) or not is_dense(times):
        index = int(np.argmax(frame_scores))
        return index, float(frame_scores[index])
    best_index, best_score = 0, -1e9
    # Only windows that still have a full shot of footage after them (whole clip if shorter).
    last_start = max(times[0], times[-1] - window + 1.0)
    for start in range(len(frame_scores)):
        if times[start] > last_start:
            break
        end = int(np.searchsorted(times, times[start] + window, side="left"))
        score = float(np.mean(frame_scores[start:max(end, start + 1)]))
        if score > best_score:
            best_index, best_score = start, score
    return best_index, best_score


def window_at(frame_scores, frame_times, start, duration):
    """Mean score of the frames a shot starting at `start` would actually show."""
    times = np.asarray(frame_times, dtype=float)
    inside = (times >= start - 0.01) & (times < start + duration)
    if inside.any() and is_dense(times):
        return float(np.mean(frame_scores[inside]))
    return float(frame_scores[int(np.argmin(np.abs(times - (start + duration / 2))))])


def blended(visual, clip, qvec, qtokens):
    """Same 0.7 visual / 0.1 title / 0.2 keyword blend for search and fit checks."""
    title = float(clip["title_vec"] @ qvec)
    lexical = len(qtokens & tokens(clip["title"] + " " + clip["description"])) / max(1, len(qtokens))
    return 0.7 * visual + 0.1 * title + 0.2 * lexical


def verify_shot(shot, qvec, clips_by_id, exclude, top_k):
    """Score the exact seconds a planned shot will show, the best part of the same
    clip, and the best other approved clips for the same spoken phrase."""
    qtokens = tokens(shot["text"])
    duration = max(1.0, float(shot.get("duration") or SHOT_WINDOW_SECONDS))
    result = {"id": shot.get("id"), "asset_id": shot.get("asset_id"), "indexed": False}
    clip = clips_by_id.get(shot.get("asset_id"))
    if clip is not None:
        scores = clip["frames"] @ qvec
        start = float(shot.get("in_point") or 0)
        index, best_visual = best_window(scores, clip["frame_times"], duration)
        result.update(indexed=True,
                      current_score=round(blended(window_at(scores, clip["frame_times"], start, duration), clip, qvec, qtokens), 4),
                      best_in_point=in_point(clip["frame_times"], index),
                      best_score=round(blended(best_visual, clip, qvec, qtokens), 4))
    alternatives = []
    for other in clips_by_id.values():
        if other["id"] == shot.get("asset_id") or other["id"] in exclude:
            continue
        index, visual = best_window(other["frames"] @ qvec, other["frame_times"], duration)
        alternatives.append((blended(visual, other, qvec, qtokens), other, index))
    alternatives.sort(key=lambda x: x[0], reverse=True)
    result["alternatives"] = [{"id": c["id"], "title": c["title"], "score": round(s, 4),
                               "in_point_seconds": in_point(c["frame_times"], i)} for s, c, i in alternatives[:top_k]]
    return result


def in_point(frame_times, index):
    """Dense windows start at their own first frame; sparse indexes keep the old lead-in."""
    times = list(frame_times)
    return round(max(0.0, times[index] - (0.0 if is_dense(times) else 1.2)), 2)


def load_clips():
    approved = set(json.loads((ROOT / "approved-stock-ids.json").read_text(encoding="utf-8")))
    local_approved = ASSET_ROOT / "local-approved-stock-ids.json"
    if local_approved.is_file():
        approved.update(json.loads(local_approved.read_text(encoding="utf-8")))
    asset_map = json.loads((ASSET_ROOT / "broll-assets" / "asset-map.json").read_text(encoding="utf-8"))["assets"]
    local_map = ASSET_ROOT / "broll-assets" / "local-asset-map.json"
    if local_map.is_file():
        asset_map.update(json.loads(local_map.read_text(encoding="utf-8"))["assets"])
    by_relative_path = {name.replace('\\', '/').casefold(): id for id, name in asset_map.items() if id in approved}
    # The service loads a point-in-time snapshot; refreshes require restart.
    # immutable avoids SQLite creating WAL/SHM sidecars beside the mounted DB.
    db = sqlite3.connect(DB.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
    db.row_factory = sqlite3.Row
    clips = []
    for row in db.execute("SELECT id,path,relative_path,title,description FROM clips WHERE present=1 AND status='complete'"):
        asset_id = by_relative_path.get(row["relative_path"].replace('\\', '/').casefold())
        if not asset_id or not (ASSET_ROOT / "broll-assets" / asset_map[asset_id]).is_file():
            continue
        vectors = {"frame": [], "title": []}
        times = []
        for e in db.execute("SELECT kind,vector,dimensions,timestamp_seconds FROM embeddings WHERE clip_id=? ORDER BY position", (row["id"],)):
            vectors[e["kind"]].append(np.frombuffer(e["vector"], dtype="<f4", count=e["dimensions"]))
            if e["kind"] == "frame":
                times.append(float(e["timestamp_seconds"]))
        if vectors["frame"] and vectors["title"]:
            clips.append({"id": asset_id, "title": row["title"], "description": row["description"],
                          "frames": np.stack(vectors["frame"]), "frame_times": times,
                          "title_vec": vectors["title"][0]})
    db.close()
    if not clips:
        raise RuntimeError("No indexed, approved, readable project clips")
    return clips


def main():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    from transformers import AutoModel, AutoProcessor

    clips = load_clips()
    clips_by_id = {clip["id"]: clip for clip in clips}
    processor = AutoProcessor.from_pretrained(MODEL, local_files_only=True)
    model = AutoModel.from_pretrained(MODEL, local_files_only=True).eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    lock = Lock()

    def encode(texts):
        with lock, torch.inference_mode():
            batch = processor(text=[f"A documentary video shot of {text}." for text in texts],
                              padding="max_length", truncation=True, return_tensors="pt")
            vec = model.get_text_features(**{k: v.to(device) for k, v in batch.items()}).float()
            return torch.nn.functional.normalize(vec, dim=-1).cpu().numpy()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/health":
                self.send_error(404)
                return
            body = json.dumps({"ready": True, "indexed_approved_clips": len(clips)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path not in ("/search", "/verify"):
                self.send_error(404)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 262144:
                    raise ValueError("Invalid request size")
                request = json.loads(self.rfile.read(size))
                key = "queries" if self.path == "/search" else "shots"
                items = request[key]
                if not isinstance(items, list) or not 0 < len(items) <= 60:
                    raise ValueError(f"Expected 1–60 {key}")
                if any(not isinstance(q.get("text"), str) or not 0 < len(q["text"]) <= 500 for q in items):
                    raise ValueError("Invalid query text")
                top_k = max(1, min(8, int(request.get("top_k", 5))))
                vec = encode([item["text"] for item in items])
                if self.path == "/verify":
                    exclude = set(request.get("exclude_ids") or [])
                    results = [verify_shot(shot, qvec, clips_by_id, exclude, top_k) for shot, qvec in zip(items, vec)]
                else:
                    results = []
                    for query, qvec in zip(items, vec):
                        qtokens = tokens(query["text"])
                        ranks = []
                        for clip in clips:
                            frame_index, visual = best_window(clip["frames"] @ qvec, clip["frame_times"])
                            ranks.append((blended(visual, clip, qvec, qtokens), clip, frame_index))
                        ranks.sort(key=lambda x: x[0], reverse=True)
                        results.append({"at": query.get("at"), "candidates": [
                            {"id": c["id"], "title": c["title"], "rank_score": round(s, 4),
                             "in_point_seconds": in_point(c["frame_times"], i)} for s, c, i in ranks[:top_k]]})
                body = json.dumps({"indexed_approved_clips": len(clips), "results": results}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (ValueError, KeyError, TypeError) as error:
                self.send_error(400, str(error))

    host = os.environ.get("BROLL_VECTOR_BIND", "127.0.0.1")
    port = int(os.environ.get("BROLL_VECTOR_PORT", "8766"))
    print(f"Ready: {len(clips)} approved indexed clips on {device}; http://{host}:{port}/search and /verify", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
