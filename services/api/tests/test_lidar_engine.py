"""Hermetic tests for the base (numpy-only) LiDAR engine + run service helpers.

None of these touch B2 or the heavy MMDetection3D stack — they exercise the
parts that must stay green in the base install (`pnpm verify` without the
engine group).
"""

from __future__ import annotations

import numpy as np
import pytest

from app.engine import device, engine_status, point_cloud
from app.service import runs as runs_service
from app.types.runs import FrameAnnotation


def _kitti_bytes(n: int = 500) -> bytes:
    rng = np.random.default_rng(0)
    pts = rng.uniform(-10, 10, size=(n, 4)).astype(np.float32)
    return pts.tobytes()


def test_read_kitti_bin_roundtrip():
    data = _kitti_bytes(300)
    pts = point_cloud.read_kitti_bin(data)
    assert pts.shape == (300, 4)
    assert pts.dtype == np.float32


def test_read_kitti_bin_rejects_bad_stride():
    with pytest.raises(point_cloud.PointCloudError):
        # 10 float32 values is not a multiple of 4.
        point_cloud.read_kitti_bin(np.zeros(10, dtype=np.float32).tobytes())


def test_frame_stats_shape():
    pts = point_cloud.read_kitti_bin(_kitti_bytes(400))
    stats = point_cloud.frame_stats(pts)
    assert stats["point_count"] == 400
    assert stats["feature_count"] == 4
    assert set(stats["bounds"]) == {"x_min", "x_max", "y_min", "y_max", "z_min", "z_max"}
    assert "mean" in stats["intensity"]
    assert stats["occupied_voxels"] >= 1


def test_render_bev_png_returns_png_bytes():
    pts = point_cloud.read_kitti_bin(_kitti_bytes(1000))
    png = point_cloud.render_bev_png(pts, size=64)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_resolve_device_defaults_cpu_without_torch(monkeypatch):
    # Force the "torch not installed" branch regardless of the host.
    monkeypatch.setattr(device, "_torch", lambda: None)
    assert device.resolve_device("auto") == "cpu"
    assert device.resolve_device("cuda") == "cpu"
    assert device.resolve_device("mps") == "cpu"


def test_engine_status_is_side_effect_free():
    status = engine_status("auto")
    assert set(status) == {"available", "device", "torch_installed", "detail"}
    assert isinstance(status["available"], bool)


def test_split_assignment_matches_val_fraction():
    # val_split 0 -> all train; 0.5 -> every other frame is val.
    assert all(runs_service._split_for(i, 0.0) == "train" for i in range(10))
    vals = [runs_service._split_for(i, 0.5) for i in range(10)]
    assert vals.count("val") == 5


def test_resolve_model_name_maps_task_and_alias():
    assert "pointpillars" in runs_service._resolve_model_name("detection", "pointpillars")
    assert runs_service._resolve_model_name("segmentation", "pointpillars") == runs_service.SEG_MODEL


def test_aggregate_rolls_up_histograms():
    frames = [
        FrameAnnotation(
            frame="a.bin", raw_key="raw/s/d/a.bin", annotation_key="ann/a.json",
            point_count=10, num_boxes=2, label_histogram={"0": 1, "1": 1}, split="train",
        ),
        FrameAnnotation(
            frame="b.bin", raw_key="raw/s/d/b.bin", annotation_key="ann/b.json",
            point_count=10, num_boxes=1, label_histogram={"0": 1}, split="val",
        ),
    ]
    summary = runs_service._aggregate(frames)
    assert summary.frame_count == 2
    assert summary.total_boxes == 3
    assert summary.train_frames == 1
    assert summary.val_frames == 1
    assert summary.per_class == {"0": 2, "1": 1}
