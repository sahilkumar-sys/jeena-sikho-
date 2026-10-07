"""Resumable local SigLIP2 index (one frame per second) for B-roll galleries."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import random
import shutil
import sqlite3
import subprocess
import sys
import time
import traceback
import uuid

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
MODEL_ID = "google/siglip2-base-patch16-224"
MODEL_REVISION = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"
INDEX_VERSION = "siglip2-base-1fps-v2"
FRAMES_PER_SECOND = 1.0
MAX_FRAMES = 120  # Long clips are sampled more sparsely to bound memory and time.
EMBED_BATCH = 32
PNG_END = b"IEND\xaeB`\x82"
STAGE_MARKER = ".heygen-indexer-owned-v1"
EXCLUDED_TOP_LEVEL_FOLDERS = {"all panchkarma therepy"}


def friendly_duration(seconds: float | None) -> str:
    if seconds is None:
        return "calculating"
    seconds = max(0, round(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}h {minutes:02d}m" if hours else f"{minutes}m {seconds:02d}s"


def title_from_name(path: Path) -> str:
    stem = path.stem
    stem = re.sub(r"-20\d{6}T\d{6}Z(?:-\d+)?$", "", stem, flags=re.I)
    stem = re.sub(r"\b\d{3,4}[xX]\d{3,4}\b", "", stem)
    stem = re.sub(r"^[\d\s._-]+", "", stem)
    stem = re.sub(r"[_-]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem or path.stem


def description_for(path: Path, root: Path) -> tuple[str, str]:
    relative = path.relative_to(root)
    folders = [part.replace("_", " ").replace("-", " ") for part in relative.parts[:-1]]
    title = title_from_name(path)
    camera_name = bool(re.fullmatch(r"(?:[A-Z]{0,3}\d{3,8}|DSC[_-]?\d+|IMG[_-]?\d+|MVI[_-]?\d+|VID[_-]?\d+)", path.stem, re.I))
    parts = folders + ([] if camera_name else [title])
    description = ", ".join(part.strip() for part in parts if part.strip())
    return title, description or title


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=30000")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS clips (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            relative_path TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            mtime_ns INTEGER NOT NULL,
            present INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending',
            duration_seconds REAL,
            width INTEGER,
            height INTEGER,
            error TEXT,
            indexed_at TEXT,
            index_version TEXT
        );
        CREATE INDEX IF NOT EXISTS clips_status_idx ON clips(present, status);
        CREATE TABLE IF NOT EXISTS embeddings (
            clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            position INTEGER NOT NULL,
            timestamp_seconds REAL NOT NULL,
            dimensions INTEGER NOT NULL,
            vector BLOB NOT NULL,
            PRIMARY KEY (clip_id, kind, position)
        );
        CREATE TABLE IF NOT EXISTS scan_errors (
            path TEXT PRIMARY KEY,
            error TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS clip_fts USING fts5(
            clip_id UNINDEXED, title, description, relative_path
        );
        """
    )
    return db


def is_excluded_relative_path(relative_path: str) -> bool:
    first_component = relative_path.replace("\\", "/").split("/", 1)[0].casefold()
    return first_component in EXCLUDED_TOP_LEVEL_FOLDERS


def purge_excluded_clips(db: sqlite3.Connection) -> int:
    rows = db.execute("SELECT id,relative_path FROM clips").fetchall()
    excluded_ids = [row["id"] for row in rows if is_excluded_relative_path(row["relative_path"])]
    for clip_id in excluded_ids:
        db.execute("DELETE FROM clip_fts WHERE clip_id=?", (clip_id,))
        db.execute("DELETE FROM clips WHERE id=?", (clip_id,))
    db.commit()
    if excluded_ids:
        print(f"Removed {len(excluded_ids)} excluded-folder records and vectors from the index.", flush=True)
    return len(excluded_ids)


def scan(db: sqlite3.Connection, root: Path) -> tuple[int, int]:
    if not root.is_dir():
        raise RuntimeError(f"Video folder does not exist: {root}")
    print(f"Scanning filenames under {root} ...", flush=True)
    purge_excluded_clips(db)
    previous_ids = {row["id"] for row in db.execute("SELECT id FROM clips")}
    # Preserve the last known gallery if a damaged/offline source cannot be traversed.
    db.execute("UPDATE clips SET present=1")
    db.execute("DELETE FROM scan_errors")
    count = changed = unreadable = 0
    seen_ids = set()
    def walk_error(exc: OSError) -> None:
        nonlocal unreadable
        print(f"Cannot scan folder: {exc}", file=sys.stderr, flush=True)
        db.execute("INSERT OR REPLACE INTO scan_errors(path,error) VALUES(?,?)",
                   (getattr(exc, "filename", "unknown folder"), str(exc)))
        unreadable += 1

    for base, directories, filenames in os.walk(root, onerror=walk_error):
        if Path(base) == root:
            skipped = [name for name in directories if name.casefold() in EXCLUDED_TOP_LEVEL_FOLDERS]
            directories[:] = [name for name in directories if name.casefold() not in EXCLUDED_TOP_LEVEL_FOLDERS]
            for name in skipped:
                print(f"Skipping excluded folder: {root / name}", flush=True)
        for filename in filenames:
            if filename.startswith("._"):
                continue  # macOS AppleDouble metadata, not a playable video
            path = Path(base) / filename
            if path.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError as exc:
                print(f"Cannot read {path}: {exc}", file=sys.stderr, flush=True)
                db.execute("INSERT OR REPLACE INTO scan_errors(path,error) VALUES(?,?)",
                           (str(path), str(exc)))
                unreadable += 1
                continue
            text_path = str(path.resolve())
            clip_id = hashlib.sha256(text_path.casefold().encode("utf-8")).hexdigest()[:24]
            seen_ids.add(clip_id)
            title, description = description_for(path, root)
            previous = db.execute(
                "SELECT size_bytes, mtime_ns, index_version FROM clips WHERE id=?", (clip_id,)
            ).fetchone()
            is_changed = previous is None or previous["size_bytes"] != stat.st_size or previous["mtime_ns"] != stat.st_mtime_ns
            db.execute(
                """INSERT INTO clips(id,path,relative_path,title,description,size_bytes,mtime_ns,present,status)
                VALUES(?,?,?,?,?,?,?,?, 'pending')
                ON CONFLICT(id) DO UPDATE SET
                    path=excluded.path, relative_path=excluded.relative_path,
                    title=excluded.title, description=excluded.description,
                    size_bytes=excluded.size_bytes, mtime_ns=excluded.mtime_ns, present=1,
                    status=CASE WHEN clips.size_bytes != excluded.size_bytes
                                      OR clips.mtime_ns != excluded.mtime_ns
                                      OR clips.index_version IS NOT ?
                                THEN 'pending' ELSE clips.status END,
                    error=CASE WHEN clips.size_bytes != excluded.size_bytes
                                    OR clips.mtime_ns != excluded.mtime_ns
                                    OR clips.index_version IS NOT ?
                               THEN NULL ELSE clips.error END
                """,
                (clip_id, text_path, str(path.relative_to(root)), title, description,
                 stat.st_size, stat.st_mtime_ns, 1, INDEX_VERSION, INDEX_VERSION),
            )
            db.execute("DELETE FROM clip_fts WHERE clip_id=?", (clip_id,))
            db.execute("INSERT INTO clip_fts(clip_id,title,description,relative_path) VALUES(?,?,?,?)",
                       (clip_id, title, description, str(path.relative_to(root))))
            count += 1
            changed += int(is_changed)
            if count % 250 == 0:
                db.commit()
                print(f"  Found {count} clips ...", flush=True)
    if unreadable == 0:
        for missing_id in previous_ids - seen_ids:
            db.execute("UPDATE clips SET present=0 WHERE id=?", (missing_id,))
    else:
        print("Source read errors occurred; retaining last-known clip records until a clean scan succeeds.", flush=True)
    db.commit()
    print(f"Filename index ready: {count} readable clips; {changed} new or changed; "
          f"{unreadable} unreadable (recorded in scan_errors).\n", flush=True)
    return count, changed


def probe_video(ffprobe: str, path: str) -> tuple[float, int, int]:
    proc = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,duration:format=duration", "-of", "json", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90, check=False,
    )
    if proc.returncode:
        raise RuntimeError("ffprobe: " + proc.stderr.decode("utf-8", "replace")[-400:])
    payload = json.loads(proc.stdout)
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError("No video stream")
    stream = streams[0]
    duration = float(stream.get("duration") or payload.get("format", {}).get("duration") or 0)
    if duration <= 0:
        raise RuntimeError("Missing or invalid video duration")
    return duration, int(stream.get("width") or 0), int(stream.get("height") or 0)


def extract_frame(ffmpeg: str, path: str, timestamp: float):
    from PIL import Image

    proc = subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp:.3f}",
         "-i", path, "-frames:v", "1", "-vf", "scale=448:-2", "-c:v", "png",
         "-f", "image2pipe", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=150, check=False,
    )
    if proc.returncode or not proc.stdout:
        raise RuntimeError("ffmpeg: " + proc.stderr.decode("utf-8", "replace")[-400:])
    with Image.open(io.BytesIO(proc.stdout)) as image:
        return image.convert("RGB")


def split_pngs(data: bytes) -> list[bytes]:
    images, start = [], 0
    while True:
        end = data.find(PNG_END, start)
        if end < 0:
            return images
        images.append(data[start:end + len(PNG_END)])
        start = end + len(PNG_END)


def extract_frames(ffmpeg: str, path: str, duration: float):
    """Decode evenly spaced frames in one ffmpeg pass; returns (images, timestamps)."""
    from PIL import Image

    fps = min(FRAMES_PER_SECOND, MAX_FRAMES / max(duration, 0.001))
    proc = subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", path,
         "-vf", f"fps={fps:.6f}:start_time=0:round=near,scale=448:-2", "-c:v", "png",
         "-f", "image2pipe", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600, check=False,
    )
    pngs = split_pngs(proc.stdout)
    if proc.returncode or not pngs:
        raise RuntimeError("ffmpeg: " + proc.stderr.decode("utf-8", "replace")[-400:])
    frames = []
    for png in pngs[:MAX_FRAMES]:
        with Image.open(io.BytesIO(png)) as image:
            frames.append(image.convert("RGB"))
    timestamps = [round(min(duration - 0.05, index / fps), 3) for index in range(len(frames))]
    return frames, timestamps


def write_progress(path: Path | None, **values) -> None:
    """Atomically write a small JSON progress counter for people to watch."""
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    values["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(values, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def preflight(db: sqlite3.Connection, ffmpeg: str, ffprobe: str, report_path: Path) -> bool:
    """Check actual frame bytes before a large model download or long index run."""
    rows = db.execute("SELECT path FROM clips WHERE present=1 ORDER BY path").fetchall()
    paths = [row["path"] for row in rows]
    sample = random.Random(20261003).sample(paths, min(12, len(paths)))
    failures = []
    print(f"Checking whether {len(sample)} sampled video files can actually be decoded ...", flush=True)
    for path in sample:
        try:
            duration, _, _ = probe_video(ffprobe, path)
            proc = subprocess.run(
                [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-ss", f"{duration * 0.35:.3f}", "-i", path,
                 "-frames:v", "1", "-vf", "scale=448:-2", "-c:v", "png",
                 "-f", "image2pipe", "-"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=150, check=False,
            )
            if proc.returncode or not proc.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-250:] or "No PNG frame produced")
            print("  OK     " + path, flush=True)
        except Exception as exc:
            failures.append((path, str(exc)))
            print("  FAILED " + path, flush=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as report:
        report.write(f"Failed {len(failures)} of {len(sample)} sampled frame reads.\n\n")
        for path, error in failures:
            report.write(path + "\n  " + error + "\n")
    print(f"Preflight: {len(sample)-len(failures)}/{len(sample)} frame reads succeeded. "
          f"Details: {report_path}", flush=True)
    if len(sample) >= 8 and len(failures) / len(sample) >= 0.75:
        print("At least 75% of sampled videos could not be decoded. Visual indexing is "
              "paused before large downloads. Check that E: files open and play normally, "
              "then double-click again.", file=sys.stderr, flush=True)
        return False
    return True


def load_model(allow_cpu: bool):
    import torch
    from transformers import AutoModel, AutoProcessor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu" and not allow_cpu:
        raise RuntimeError("CUDA GPU is unavailable. Filename index is saved. Fix the NVIDIA/PyTorch setup, or explicitly use --allow-cpu.")
    print(f"Loading {MODEL_ID} on {device}. The first run downloads the model to the configured cache ...", flush=True)
    processor = AutoProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = AutoModel.from_pretrained(MODEL_ID, revision=MODEL_REVISION).to(device).eval()
    return torch, processor, model, device


def normalized_vector(tensor, torch):
    if not isinstance(tensor, torch.Tensor):
        tensor = tensor.pooler_output if hasattr(tensor, "pooler_output") else tensor[0]
    tensor = tensor.float()
    tensor = torch.nn.functional.normalize(tensor, dim=-1)
    return tensor.cpu().numpy()


def embed_clip(path: str, description: str, duration: float, ffmpeg: str, torch, processor, model, device):
    import numpy

    frames, timestamps = extract_frames(ffmpeg, path, duration)
    with torch.inference_mode():
        chunks = []
        for start in range(0, len(frames), EMBED_BATCH):
            image_inputs = processor(images=frames[start:start + EMBED_BATCH], return_tensors="pt")
            image_inputs = {key: value.to(device) for key, value in image_inputs.items()}
            chunks.append(normalized_vector(model.get_image_features(**image_inputs), torch))
        image_vectors = numpy.concatenate(chunks)
        text_inputs = processor(text=[description], padding="max_length", truncation=True, return_tensors="pt")
        text_inputs = {key: value.to(device) for key, value in text_inputs.items()}
        text_vector = normalized_vector(model.get_text_features(**text_inputs), torch)[0]
    return [("title", -1, 0.0, text_vector)] + [
        ("frame", position, timestamp, vector)
        for position, (timestamp, vector) in enumerate(zip(timestamps, image_vectors))
    ]


def write_error_report(db: sqlite3.Connection, path: Path) -> int:
    scan_errors = db.execute("SELECT path,error FROM scan_errors ORDER BY path").fetchall()
    clip_errors = db.execute(
        "SELECT path,error FROM clips WHERE present=1 AND status='error' ORDER BY path"
    ).fetchall()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as report:
        report.write(f"Unreadable during filename scan: {len(scan_errors)}\n")
        for row in scan_errors:
            report.write(f"{row['path']}\n  {row['error']}\n")
        report.write(f"\nFailed during video frame indexing: {len(clip_errors)}\n")
        for row in clip_errors:
            report.write(f"{row['path']}\n  {row['error']}\n")
    return len(scan_errors) + len(clip_errors)


def batch_groups(rows, max_bytes: int):
    batch = []
    size = 0
    for row in rows:
        clip_bytes = max(0, row["size_bytes"])
        if batch and size + clip_bytes > max_bytes:
            yield batch, size
            batch, size = [], 0
        batch.append(row)
        size += clip_bytes
    if batch:
        yield batch, size


def safe_batch_directory(stage_root: Path, batch_dir: Path) -> bool:
    root = stage_root.resolve()
    path = batch_dir.resolve()
    return (path.parent == root and path.name.startswith("batch-") and
            (path / STAGE_MARKER).is_file())


def clean_batch(stage_root: Path, batch_dir: Path) -> None:
    if not safe_batch_directory(stage_root, batch_dir):
        raise RuntimeError(f"Refusing to clean an unrecognized staging directory: {batch_dir}")
    for item in batch_dir.iterdir():
        if item.name == STAGE_MARKER:
            continue
        if not item.is_file() or not re.fullmatch(r"[a-f0-9]{24}\.(?:mp4|mov|m4v|mkv|avi|webm)(?:\.part)?", item.name, re.I):
            raise RuntimeError(f"Unexpected file in staging directory; leaving it untouched: {item}")
        item.unlink()
    (batch_dir / STAGE_MARKER).unlink()
    batch_dir.rmdir()


def prepare_stage_root(stage_root: Path) -> None:
    stage_root.mkdir(parents=True, exist_ok=True)
    marker = stage_root / STAGE_MARKER
    if not marker.exists():
        if any(stage_root.iterdir()):
            raise RuntimeError(f"Staging folder already contains other data: {stage_root}. Choose an empty folder.")
        marker.write_text("Temporary copies for the Heygen video indexer. Originals are never moved.\n", encoding="utf-8")
    for child in stage_root.iterdir():
        if child.is_dir() and child.name.startswith("batch-"):
            print(f"Cleaning interrupted temporary batch: {child}", flush=True)
            clean_batch(stage_root, child)


def make_batch_dir(stage_root: Path) -> Path:
    batch_dir = stage_root / f"batch-{uuid.uuid4().hex[:12]}"
    batch_dir.mkdir()
    (batch_dir / STAGE_MARKER).write_text("Indexer-owned temporary batch.\n", encoding="utf-8")
    return batch_dir


MP4_BOXES = {b"ftyp", b"moov", b"mdat", b"free", b"wide", b"skip", b"pnot", b"uuid"}


def check_video_header(path: str) -> None:
    """Reject damaged/incomplete sources before copying or decoding them.

    Damaged files on the dirty E: exFAT volume keep their size but start with
    zero bytes instead of a container header; copying them wastes time and reads.
    """
    with open(path, "rb") as reader:
        head = reader.read(12)
    suffix = Path(path).suffix.lower()
    if suffix in {".mp4", ".mov", ".m4v"}:
        ok = len(head) >= 8 and head[4:8] in MP4_BOXES
    elif suffix in {".mkv", ".webm"}:
        ok = head[:4] == b"\x1a\x45\xdf\xa3"
    elif suffix == ".avi":
        ok = head[:4] == b"RIFF" and head[8:12] == b"AVI "
    else:
        ok = bool(head)
    if not ok:
        raise RuntimeError("damaged or incomplete source: no valid video header (file starts with "
                           + (head[:8].hex() or "nothing") + "); skipped without copying")


def stage_verified(row, batch_dir: Path) -> Path:
    source = Path(row["path"])
    target = batch_dir / (row["id"] + source.suffix.lower())
    partial = batch_dir / (target.name + ".part")
    source_digest = hashlib.sha256()
    byte_count = 0
    started = time.monotonic()
    try:
        with source.open("rb") as reader, partial.open("xb") as writer:
            while True:
                chunk = reader.read(8 * 1024 * 1024)
                if not chunk:
                    break
                writer.write(chunk)
                source_digest.update(chunk)
                byte_count += len(chunk)
                if byte_count and byte_count % (256 * 1024 * 1024) < len(chunk):
                    print(f"    copied {byte_count/2**30:.2f} GiB of {row['size_bytes']/2**30:.2f} GiB ...", flush=True)
        if byte_count != row["size_bytes"]:
            raise RuntimeError(f"Source size changed during copy: expected {row['size_bytes']}, got {byte_count}")
        target_digest = hashlib.sha256()
        with partial.open("rb") as reader:
            for chunk in iter(lambda: reader.read(8 * 1024 * 1024), b""):
                target_digest.update(chunk)
        if source_digest.digest() != target_digest.digest():
            raise RuntimeError("SHA-256 copy verification failed")
        partial.replace(target)
        print(f"    verified {byte_count/2**20:.0f} MiB in {friendly_duration(time.monotonic()-started)}", flush=True)
        return target
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def stage_test(db: sqlite3.Connection, stage_root: Path, max_bytes: int, limit: int) -> int:
    rows = db.execute("SELECT * FROM clips WHERE present=1 ORDER BY relative_path COLLATE NOCASE LIMIT ?", (limit,)).fetchall()
    prepare_stage_root(stage_root)
    passed = failed = 0
    for batch, size in batch_groups(rows, max_bytes):
        batch_dir = make_batch_dir(stage_root)
        try:
            print(f"Testing staged batch: {len(batch)} files, {size/2**30:.2f} GiB", flush=True)
            for row in batch:
                try:
                    stage_verified(row, batch_dir)
                    passed += 1
                except Exception as exc:
                    failed += 1
                    print(f"COPY FAILED: {row['path']}: {exc}", flush=True)
        finally:
            clean_batch(stage_root, batch_dir)
    print(f"Staging test: {passed} verified, {failed} failed. Originals left in place.", flush=True)
    return 0 if failed == 0 else 4


def index_pending(db: sqlite3.Connection, ffmpeg: str, ffprobe: str, allow_cpu: bool,
                  limit: int | None, log_path: Path, stage_root: Path | None,
                  stage_max_bytes: int, progress_path: Path | None = None, label: str = "index"):
    rows = db.execute(
        """SELECT * FROM clips WHERE present=1 AND
        (status!='complete' OR index_version IS NOT ?) ORDER BY relative_path COLLATE NOCASE""",
        (INDEX_VERSION,),
    ).fetchall()
    complete = db.execute(
        "SELECT COUNT(*) FROM clips WHERE present=1 AND status='complete' AND index_version=?",
        (INDEX_VERSION,),
    ).fetchone()[0]
    total = len(rows) + complete
    if limit is not None:
        rows = rows[:limit]
    print(f"Total: {total} | already indexed: {complete} | remaining: {total-complete}", flush=True)
    if not rows:
        print("All current clips are indexed.", flush=True)
        write_progress(progress_path, label=label, state="complete", done=complete, total=total,
                       percent=100.0, errors=0, eta_seconds=0, current="")
        return
    write_progress(progress_path, label=label, state="loading model", done=complete, total=total,
                   percent=round(100 * complete / total, 1) if total else 100.0, errors=0,
                   eta_seconds=None, current="")
    if stage_root is not None:
        prepare_stage_root(stage_root)
        print(f"Staging in verified batches of up to {stage_max_bytes/2**30:.1f} GiB: {stage_root}", flush=True)
    torch, processor, model, device = load_model(allow_cpu)
    started = time.monotonic()
    done_this_run = failures = 0
    log_path.parent.mkdir(parents=True, exist_ok=True)
    batches = list(batch_groups(rows, stage_max_bytes)) if stage_root else [(rows, sum(row["size_bytes"] for row in rows))]
    with log_path.open("a", encoding="utf-8") as log:
        for batch_number, (batch, batch_bytes) in enumerate(batches, 1):
            batch_dir = None
            staged_paths = {}
            stage_errors = {}
            try:
                if stage_root is not None:
                    free = shutil.disk_usage(stage_root).free
                    if free < batch_bytes + 2 * 2**30:
                        raise RuntimeError(f"Not enough staging space. Need {(batch_bytes+2*2**30)/2**30:.1f} GiB free on {stage_root}")
                    batch_dir = make_batch_dir(stage_root)
                    write_progress(progress_path, label=label, state=f"copying chunk {batch_number}/{len(batches)}",
                                   chunk=f"{batch_number}/{len(batches)}", done=complete + done_this_run,
                                   total=total, percent=round(100 * (complete + done_this_run) / total, 1),
                                   errors=failures, eta_seconds=None,
                                   current=f"{len(batch)} clips, {batch_bytes/2**30:.2f} GiB")
                    print(f"\nBatch {batch_number}/{len(batches)}: copying and verifying "
                          f"{len(batch)} clips ({batch_bytes/2**30:.2f} GiB) ...", flush=True)
                    for stage_number, row in enumerate(batch, 1):
                        print(f"  Copy {stage_number}/{len(batch)}: {row['relative_path']}", flush=True)
                        try:
                            check_video_header(row["path"])
                            staged_paths[row["id"]] = stage_verified(row, batch_dir)
                        except Exception as exc:
                            stage_errors[row["id"]] = str(exc)
                            print(f"    COPY FAILED: {exc}", flush=True)
                for row in batch:
                    clip_started = time.monotonic()
                    try:
                        if row["id"] in stage_errors:
                            raise RuntimeError(stage_errors[row["id"]] if stage_errors[row["id"]].startswith("damaged")
                                               else "source-to-stage copy failed: " + stage_errors[row["id"]])
                        if stage_root is None:
                            check_video_header(row["path"])
                        read_path = str(staged_paths[row["id"]]) if stage_root is not None else row["path"]
                        duration, width, height = probe_video(ffprobe, read_path)
                        vectors = embed_clip(read_path, row["description"], duration, ffmpeg,
                                             torch, processor, model, device)
                        with db:
                            db.execute("DELETE FROM embeddings WHERE clip_id=?", (row["id"],))
                            for kind, position, timestamp, vector in vectors:
                                db.execute(
                                    "INSERT INTO embeddings(clip_id,kind,position,timestamp_seconds,dimensions,vector) VALUES(?,?,?,?,?,?)",
                                    (row["id"], kind, position, timestamp, vector.size, vector.astype("float32").tobytes()),
                                )
                            db.execute(
                                """UPDATE clips SET status='complete', error=NULL, duration_seconds=?,
                                width=?, height=?, indexed_at=datetime('now'), index_version=? WHERE id=?""",
                                (duration, width, height, INDEX_VERSION, row["id"]),
                            )
                        outcome = "OK"
                    except KeyboardInterrupt:
                        print("\nStopped. Progress is saved; double-click again to resume.", flush=True)
                        return
                    except Exception as exc:
                        failures += 1
                        outcome = f"ERROR: {str(exc)[:140]}"
                        with db:
                            db.execute("UPDATE clips SET status='error', error=? WHERE id=?",
                                       (str(exc)[:1000], row["id"]))
                    done_this_run += 1
                    remaining = total - complete - done_this_run
                    elapsed = time.monotonic() - started
                    eta = elapsed / done_this_run * remaining if done_this_run else None
                    percent = 100 * (complete + done_this_run) / total if total else 100
                    short_path = row["relative_path"][-82:]
                    line = (f"processed {complete+done_this_run}/{total} ({percent:.1f}%) | left {remaining} | "
                            f"ETA {friendly_duration(eta)} | errors {failures} | {outcome} | {short_path}")
                    print(line, flush=True)
                    write_progress(progress_path, label=label, state="indexing",
                                   chunk=f"{batch_number}/{len(batches)}", done=complete + done_this_run,
                                   total=total, percent=round(percent, 1), errors=failures,
                                   eta_seconds=round(eta) if eta is not None else None,
                                   current=row["relative_path"][-120:])
                    log.write(json.dumps({"path": row["path"], "outcome": outcome,
                                          "seconds": round(time.monotonic()-clip_started, 2),
                                          "progress": complete+done_this_run, "total": total}, ensure_ascii=False) + "\n")
                    log.flush()
            finally:
                if batch_dir is not None:
                    clean_batch(stage_root, batch_dir)
    print(f"\nRun finished. Indexed this run: {done_this_run-failures}; errors: {failures}.", flush=True)
    write_progress(progress_path, label=label, state="finished", done=complete + done_this_run, total=total,
                   percent=round(100 * (complete + done_this_run) / total, 1) if total else 100.0,
                   errors=failures, eta_seconds=0, current="")
    if limit is not None and total - complete > len(rows):
        print("Test limit reached; remaining clips were not started.", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent / "broll-assets")
    parser.add_argument("--db", type=Path, default=Path(__file__).resolve().parent / "local-clips.sqlite")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--prepare-only", action="store_true", help="Index filenames only; no model download")
    parser.add_argument("--preflight", action="store_true", help="Index filenames and test sample frame reads before setup")
    parser.add_argument("--allow-cpu", action="store_true")
    parser.add_argument("--limit", type=int, help="Maximum clips to embed; useful for a pilot")
    parser.add_argument("--stage-dir", type=Path, help="Temporary verified source copies; originals remain untouched")
    parser.add_argument("--stage-max-gib", type=float, default=20.0)
    parser.add_argument("--progress-file", type=Path, help="JSON progress counter updated after every clip")
    parser.add_argument("--label", default="index", help="Name shown in the progress counter")
    parser.add_argument("--stage-test", action="store_true", help="Copy/verify/clean a small batch, without loading the model")
    parser.add_argument("--check-deps", action="store_true", help="Verify installed inference libraries and CUDA")
    args = parser.parse_args()
    if args.check_deps:
        import torch
        import transformers
        import PIL
        import numpy
        print(f"PyTorch {torch.__version__}; Transformers {transformers.__version__}; "
              f"Pillow {PIL.__version__}; NumPy {numpy.__version__}; CUDA {torch.cuda.is_available()}",
              flush=True)
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA PyTorch could not access the NVIDIA GPU")
        return 0
    if args.stage_max_gib <= 0:
        parser.error("--stage-max-gib must be positive")
    root = args.root.resolve()
    db = connect(args.db)
    try:
        scanned, _ = scan(db, root)
        if scanned == 0 and db.execute("SELECT COUNT(*) FROM scan_errors").fetchone()[0]:
            print("SOURCE UNREADABLE: no project-gallery clips could be scanned. "
                  "Check broll-assets and retry; saved records remain available.", file=sys.stderr, flush=True)
            return 5
        if args.stage_test:
            if args.stage_dir is None:
                parser.error("--stage-test requires --stage-dir")
            return stage_test(db, args.stage_dir, int(args.stage_max_gib * 2**30), args.limit or 2)
        if args.preflight:
            passed = preflight(db, args.ffmpeg, args.ffprobe,
                               args.db.parent.parent / "logs" / "preflight-errors.txt")
            write_error_report(db, args.db.parent.parent / "logs" / "index-errors.txt")
            return 0 if passed else 3
        if not args.prepare_only:
            index_pending(db, args.ffmpeg, args.ffprobe, args.allow_cpu, args.limit,
                          args.db.parent.parent / "logs" / "indexing.jsonl",
                          args.stage_dir, int(args.stage_max_gib * 2**30), args.progress_file, args.label)
        report_path = args.db.parent.parent / "logs" / "index-errors.txt"
        error_count = write_error_report(db, report_path)
        complete = db.execute(
            "SELECT COUNT(*) FROM clips WHERE present=1 AND status='complete' AND index_version=?",
            (INDEX_VERSION,),
        ).fetchone()[0]
        total = db.execute("SELECT COUNT(*) FROM clips WHERE present=1").fetchone()[0]
        print(f"Status: {complete}/{total} visually indexed; {error_count} errors. "
              f"Error report: {report_path}", flush=True)
        if not args.prepare_only and args.limit is None and (error_count or complete != total):
            print("Some clips could not be indexed. The successful clips are saved; retry after resolving errors.",
                  file=sys.stderr, flush=True)
            return 2
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FATAL: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc()
        sys.exit(1)
