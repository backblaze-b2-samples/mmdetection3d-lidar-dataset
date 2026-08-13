"""Thin wrapper over the real MMDetection3D LiDAR inference API.

This is the vendor engine, not a substitute: it drives MMDetection3D's own
`LidarDet3DInferencer` (3D object detection) and `LidarSeg3DInferencer`
(point-wise semantic segmentation) on a single LiDAR frame and returns the
model's 3D boxes (`bbox_3d`, `labels_3d`, `scores_3d`) and/or per-class
point-segmentation counts.

EVERYTHING heavy (torch, mmcv, mmengine, mmdet, mmdet3d) is imported lazily
inside the functions below, so importing this module at app boot costs nothing
and the test suite runs green with only the base requirements. Install the engine
with `pnpm run setup:mmdet3d-engine`; the model zoo + config/checkpoint recipe is
in docs/features/mmdet3d-engine.md.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class EngineUnavailableError(RuntimeError):
    """Raised when the MMDetection3D engine (or its model) isn't available.

    The run route maps this to a clear "engine not installed — run
    `pnpm run setup:mmdet3d-engine`" error; the run is never marked done with a
    fabricated result.
    """


def _write_temp_frame(data: bytes, suffix: str) -> Path:
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
    return Path(path)


def _to_numpy(x: Any):
    """Convert an MMDetection3D result field (tensor / *Instance3DBoxes) to numpy.

    ``bboxes_3d`` is a LiDARInstance3DBoxes whose underlying data is ``.tensor``;
    scores/labels are plain tensors. Unwrap ``.tensor`` first, then detach.
    """
    import numpy as np

    t = getattr(x, "tensor", x)
    if hasattr(t, "detach"):
        t = t.detach().cpu().numpy()
    return np.asarray(t)


def _detect(frame_path: str, *, model: str, weights: str, device: str, score_threshold: float) -> dict:
    """Run 3D object detection on one frame; return boxes above the threshold."""
    from mmdet3d.apis import LidarDet3DInferencer

    inferencer = LidarDet3DInferencer(
        model=model, weights=weights or None, device=device
    )
    out = inferencer(dict(points=frame_path), return_datasamples=True)
    samples = out.get("predictions", out) if isinstance(out, dict) else out
    sample = samples[0] if isinstance(samples, (list, tuple)) else samples
    inst = sample.pred_instances_3d

    bboxes = _to_numpy(inst.bboxes_3d)  # (N, 7): x,y,z,dx,dy,dz,yaw
    scores = _to_numpy(inst.scores_3d).reshape(-1)
    labels = _to_numpy(inst.labels_3d).reshape(-1).astype(int)

    boxes = []
    for i in range(len(scores)):
        if float(scores[i]) < score_threshold:
            continue
        boxes.append(
            {
                "bbox_3d": [round(float(v), 4) for v in bboxes[i][:7]],
                "label_3d": int(labels[i]),
                "score_3d": round(float(scores[i]), 4),
            }
        )
    return {"boxes": boxes, "num_boxes": len(boxes)}


def _segment(frame_path: str, *, model: str, weights: str, device: str) -> dict:
    """Run point-wise semantic segmentation; return per-class point counts."""
    import numpy as np
    from mmdet3d.apis import LidarSeg3DInferencer

    inferencer = LidarSeg3DInferencer(
        model=model, weights=weights or None, device=device
    )
    out = inferencer(dict(points=frame_path), return_datasamples=True)
    samples = out.get("predictions", out) if isinstance(out, dict) else out
    sample = samples[0] if isinstance(samples, (list, tuple)) else samples
    seg = sample.pred_pts_seg.pts_semantic_mask
    mask = np.asarray(seg.detach().cpu().numpy() if hasattr(seg, "detach") else seg).reshape(-1)
    classes, counts = np.unique(mask, return_counts=True)
    return {
        "segmentation": {int(c): int(n) for c, n in zip(classes, counts, strict=False)},
        "num_points": int(mask.size),
    }


def run_inference(
    frame_bytes: bytes,
    *,
    task: str,
    device: str,
    model: str,
    weights: str,
    score_threshold: float = 0.3,
    fmt: str = "bin",
) -> dict:
    """Run real MMDetection3D inference on one LiDAR frame.

    Returns a dict with `boxes` (detection) and/or `segmentation` (segmentation).
    Raises EngineUnavailableError when the engine or model is missing.
    """
    if not model:
        raise EngineUnavailableError(
            "No MMDetection3D model configured. Set MMDET3D_MODEL_CONFIG (and "
            "MMDET3D_MODEL_CHECKPOINT) or pick a shipped model alias — see "
            "docs/features/mmdet3d-engine.md."
        )
    suffix = ".pcd" if fmt.lower().lstrip(".") == "pcd" else ".bin"
    frame_path = _write_temp_frame(frame_bytes, suffix)
    try:
        logger.info(
            "MMDetection3D inference: task=%s model=%s device=%s", task, model, device
        )
        if task == "segmentation":
            return _segment(str(frame_path), model=model, weights=weights, device=device)
        return _detect(
            str(frame_path),
            model=model,
            weights=weights,
            device=device,
            score_threshold=score_threshold,
        )
    except ImportError as e:
        raise EngineUnavailableError(
            "MMDetection3D engine is not installed. Run "
            "`pnpm run setup:mmdet3d-engine` "
            f"(services/api/requirements-engine.txt). Import error: {e}"
        ) from e
    finally:
        frame_path.unlink(missing_ok=True)
