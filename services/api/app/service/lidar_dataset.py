"""Per-frame LiDAR processing + dataset-manifest assembly.

Split out of `service.runs` so that module stays lean and under the 300-line
cap. This orchestrates, one frame at a time: read raw scan from B2 -> numpy
frame stats + BEV preview (base engine) -> real MMDetection3D inference (heavy
engine) -> write the per-frame annotation JSON + preview + preprocessed tensor
back to B2. It also assembles the dataset manifest JSONL and archives the model
checkpoint record. boto3 stays in repo/; this only orchestrates.
"""

from __future__ import annotations

import io
import json

from app.engine import point_cloud
from app.engine.mmdet3d_runner import run_inference
from app.repo import runs as repo
from app.types.runs import FrameAnnotation


def _frame_name(raw_key: str) -> str:
    return raw_key.rsplit("/", 1)[-1]


def _fmt_of(raw_key: str) -> str:
    return "pcd" if raw_key.lower().endswith(".pcd") else "bin"


def _preprocessed_npz(points, stats: dict) -> bytes:
    """Compact .npz of the (subsampled) points + stats — the 'preprocess' stage."""
    import numpy as np

    pts = np.asarray(points, dtype=np.float32)
    # Cap at 50k points so the demonstrative preprocessed tensor stays small.
    if pts.shape[0] > 50_000:
        idx = np.linspace(0, pts.shape[0] - 1, 50_000).astype(np.int64)
        pts = pts[idx]
    buf = io.BytesIO()
    np.savez_compressed(buf, points=pts, stats=json.dumps(stats))
    return buf.getvalue()


def process_frame(
    run_id: str,
    raw_key: str,
    *,
    task: str,
    device: str,
    model: str,
    checkpoint: str,
    score_threshold: float,
    split: str,
) -> tuple[FrameAnnotation, int, int]:
    """Detect/segment one frame and write all its artifacts. Returns
    (FrameAnnotation, derived_bytes, source_bytes)."""
    raw_bytes = repo.get_object_bytes(raw_key)
    fmt = _fmt_of(raw_key)
    points = point_cloud.read_points(raw_bytes, fmt=fmt)
    stats = point_cloud.frame_stats(points)

    name = _frame_name(raw_key)
    stem = name.rsplit(".", 1)[0]

    # Real MMDetection3D inference (never mocked).
    result = run_inference(
        raw_bytes,
        task=task,
        device=device,
        model=model,
        weights=checkpoint,
        score_threshold=score_threshold,
        fmt=fmt,
    )
    boxes = result.get("boxes", [])
    histogram: dict[str, int] = {}
    for b in boxes:
        key = str(b["label_3d"])
        histogram[key] = histogram.get(key, 0) + 1

    annotation = {
        "frame": name,
        "raw_key": raw_key,
        "task": task,
        "model": model,
        "device": device,
        "score_threshold": score_threshold,
        "stats": stats,
        "boxes": boxes,
        "segmentation": result.get("segmentation"),
        "split": split,
    }

    derived = 0
    preview_key = f"{repo.run_prefix(run_id)}previews/{stem}.png"
    try:
        preview = point_cloud.render_bev_png(points)
        derived += repo.put_artifact(preview_key, preview, "image/png")
    except Exception:
        # A preview failure must not fail the run — the annotation is what matters.
        preview_key = None

    pre_key = f"{repo.preprocessed_prefix(run_id)}{stem}.npz"
    derived += repo.put_artifact(pre_key, _preprocessed_npz(points, stats),
                                 "application/octet-stream")

    ann_key = f"{repo.annotations_prefix(run_id)}{stem}.json"
    derived += repo.put_artifact(
        ann_key, json.dumps(annotation, indent=2).encode("utf-8"), "application/json"
    )

    frame = FrameAnnotation(
        frame=name,
        raw_key=raw_key,
        annotation_key=ann_key,
        preview_key=preview_key,
        point_count=stats["point_count"],
        num_boxes=len(boxes),
        label_histogram=histogram,
        split=split,  # type: ignore[arg-type]
    )
    return frame, derived, len(raw_bytes)


def write_dataset_manifest(run_id: str, frames: list[FrameAnnotation]) -> tuple[str, int]:
    """Assemble the dataset manifest JSONL (one line per frame -> split)."""
    lines = []
    for f in frames:
        lines.append(
            json.dumps(
                {
                    "frame": f.frame,
                    "raw_key": f.raw_key,
                    "annotation_key": f.annotation_key,
                    "split": f.split,
                    "num_boxes": f.num_boxes,
                    "point_count": f.point_count,
                }
            )
        )
    body = ("\n".join(lines) + "\n").encode("utf-8") if lines else b""
    key = repo.dataset_manifest_key(run_id)
    size = repo.put_artifact(key, body, "application/x-ndjson")
    return key, size


def archive_checkpoint(run_id: str, model: str, model_name: str, checkpoint: str) -> tuple[str, int]:
    """Archive the active model checkpoint under checkpoints/<model>/.

    HONEST BOUNDARY (documented, like the settings demo): the demo does not
    *train* a model, so there is usually no local .pth to copy — it archives a
    checkpoint record describing the pretrained weights, and if
    MMDET3D_MODEL_CHECKPOINT points at a real local .pth it uploads that too. A
    real per-epoch training loop would write `<epoch>.pth` objects to this exact
    prefix. See docs/features/detection-runs.md ("Checkpoint archival").
    """
    import os

    prefix = repo.checkpoints_prefix(model)
    total = 0
    key = f"{prefix}checkpoint.json"
    record = {
        "model": model,
        "resolved_model": model_name,
        "run_id": run_id,
        "note": (
            "Pretrained checkpoint record. A real training loop would write "
            "per-epoch <epoch>.pth objects to this same prefix."
        ),
    }
    if checkpoint and os.path.isfile(checkpoint):
        with open(checkpoint, "rb") as fh:
            data = fh.read()
        pth_key = f"{prefix}{os.path.basename(checkpoint)}"
        total += repo.put_artifact(pth_key, data, "application/octet-stream")
        record["checkpoint_key"] = pth_key
        record["checkpoint_bytes"] = len(data)
    total += repo.put_artifact(
        key, json.dumps(record, indent=2).encode("utf-8"), "application/json"
    )
    return key, total
