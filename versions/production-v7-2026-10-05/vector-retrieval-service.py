"""Local SigLIP2 shortlist for the production factory's approved project clips.

Run on the Windows host using the existing Heygen-Vector-Cache Python venv.
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
MODEL = Path(os.environ.get("BROLL_VECTOR_MODEL", r"C:\Users\js19187\Documents\Codex\Heygen-Vector-Cache\models\hub\models--google--siglip2-base-patch16-224\snapshots\75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"))
STOP = {"the", "and", "for", "with", "from", "video", "shot", "person", "people", "indian"}


def tokens(value):
    return {x for x in re.findall(r"[a-z]{3,}", value.casefold()) if x not in STOP}


def load_clips():
    approved = set(json.loads((ROOT / "approved-stock-ids.json").read_text(encoding="utf-8")))
    asset_map = json.loads((ASSET_ROOT / "broll-assets" / "asset-map.json").read_text(encoding="utf-8"))["assets"]
    by_name = {name.casefold(): id for id, name in asset_map.items() if id in approved}
    # The service loads a point-in-time snapshot; refreshes require restart.
    # immutable avoids SQLite creating WAL/SHM sidecars beside the mounted DB.
    db = sqlite3.connect(DB.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
    db.row_factory = sqlite3.Row
    clips = []
    for row in db.execute("SELECT id,path,title,description FROM clips WHERE present=1 AND status='complete'"):
        asset_id = by_name.get(Path(row["path"]).name.casefold())
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
    processor = AutoProcessor.from_pretrained(MODEL, local_files_only=True)
    model = AutoModel.from_pretrained(MODEL, local_files_only=True).eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    lock = Lock()

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
            if self.path != "/search":
                self.send_error(404)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 65536:
                    raise ValueError("Invalid request size")
                request = json.loads(self.rfile.read(size))
                queries = request["queries"]
                if not isinstance(queries, list) or not 0 < len(queries) <= 60:
                    raise ValueError("Expected 1–60 queries")
                if any(not isinstance(q.get("text"), str) or not 0 < len(q["text"]) <= 500 for q in queries):
                    raise ValueError("Invalid query text")
                top_k = max(1, min(8, int(request.get("top_k", 5))))
                with lock, torch.inference_mode():
                    batch = processor(text=[f"A documentary video shot of {q['text']}." for q in queries],
                                      padding="max_length", truncation=True, return_tensors="pt")
                    vec = model.get_text_features(**{k: v.to(device) for k, v in batch.items()}).float()
                    vec = torch.nn.functional.normalize(vec, dim=-1).cpu().numpy()
                results = []
                for query, qvec in zip(queries, vec):
                    qtokens = tokens(query["text"])
                    ranks = []
                    for clip in clips:
                        frame_scores = clip["frames"] @ qvec
                        frame_index = int(np.argmax(frame_scores))
                        visual = float(frame_scores[frame_index])
                        title = float(clip["title_vec"] @ qvec)
                        lexical = len(qtokens & tokens(clip["title"] + " " + clip["description"])) / max(1, len(qtokens))
                        ranks.append((0.7 * visual + 0.1 * title + 0.2 * lexical, clip, frame_index))
                    ranks.sort(key=lambda x: x[0], reverse=True)
                    results.append({"at": query.get("at"), "candidates": [
                        {"id": c["id"], "title": c["title"], "rank_score": round(s, 4),
                         "in_point_seconds": round(max(0, c["frame_times"][i] - 1.2), 2)} for s, c, i in ranks[:top_k]]})
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
    print(f"Ready: {len(clips)} approved indexed clips on {device}; http://{host}:{port}/search", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
