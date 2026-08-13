"""Point-cloud parsing, frame statistics, and browser-preview rendering.

This module is deliberately **numpy-only** at import time (numpy ships in the
BASE requirements), so the base app can parse KITTI-format ``.bin`` frames,
compute per-frame geometry stats, and render a bird's-eye-view preview WITHOUT
the heavy OpenMMLab engine installed. `Pillow` is imported lazily inside the
render function only (also a base dependency). `.pcd` decoding needs `open3d`
and is therefore engine-optional — it raises a clear error when open3d is
missing rather than pretending to succeed.

KITTI LiDAR layout: a raw `.bin` is a flat little-endian float32 buffer reshaped
to ``(-1, 4)`` = ``(x, y, z, intensity)``.
"""

from __future__ import annotations

from typing import Any

import numpy as np

# KITTI Velodyne frames are 4 features per point (x, y, z, intensity). nuScenes
# frames carry 5 (adds a ring/time channel); we accept either and only ever use
# the first four for geometry + intensity.
KITTI_FEATURES = 4
_ACCEPTED_FEATURES = (4, 5)


class PointCloudError(ValueError):
    """Raised when a point-cloud buffer can't be parsed."""


def read_kitti_bin(data: bytes, num_features: int = KITTI_FEATURES) -> np.ndarray:
    """Parse a KITTI-format ``.bin`` buffer into an ``(N, num_features)`` array.

    Raises PointCloudError when the byte length isn't a clean multiple of the
    feature stride (a strong signal the file isn't a KITTI float32 cloud).
    """
    if num_features not in _ACCEPTED_FEATURES:
        raise PointCloudError(f"Unsupported feature count: {num_features}")
    arr = np.frombuffer(data, dtype=np.float32)
    if arr.size == 0 or arr.size % num_features != 0:
        raise PointCloudError(
            f"Buffer of {arr.size} float32 values is not a multiple of "
            f"{num_features}; not a KITTI-format .bin frame."
        )
    return arr.reshape(-1, num_features)


def infer_feature_count(data: bytes) -> int:
    """Best-effort guess at the per-point stride (4 for KITTI, 5 for nuScenes)."""
    n = len(data) // 4  # number of float32 values
    for f in _ACCEPTED_FEATURES:
        if n % f == 0:
            return f
    return KITTI_FEATURES


def read_points(data: bytes, *, fmt: str = "bin") -> np.ndarray:
    """Parse a frame buffer of the given format into an ``(N, >=4)`` array."""
    fmt = fmt.lower().lstrip(".")
    if fmt in ("bin", "kitti"):
        return read_kitti_bin(data, infer_feature_count(data))
    if fmt == "pcd":
        return _read_pcd(data)
    raise PointCloudError(f"Unsupported point-cloud format: .{fmt}")


def _read_pcd(data: bytes) -> np.ndarray:
    """Decode a ``.pcd`` via open3d (engine-optional).

    open3d is only in the opt-in engine group, so this raises a clear,
    actionable error when it isn't installed instead of a bare ImportError.
    """
    try:
        import tempfile

        import open3d as o3d  # type: ignore
    except Exception as e:
        raise PointCloudError(
            ".pcd decoding needs open3d (opt-in engine group). Install it with "
            "`pnpm run setup:mmdet3d-engine`, or ingest KITTI-format .bin frames."
        ) from e
    with tempfile.NamedTemporaryFile(suffix=".pcd") as tmp:
        tmp.write(data)
        tmp.flush()
        pcd = o3d.io.read_point_cloud(tmp.name)
    xyz = np.asarray(pcd.points, dtype=np.float32)
    if xyz.size == 0:
        raise PointCloudError("Empty or unreadable .pcd frame")
    intensity = np.zeros((xyz.shape[0], 1), dtype=np.float32)
    return np.hstack([xyz, intensity])


def frame_stats(points: np.ndarray, *, voxel_size: float = 0.5) -> dict[str, Any]:
    """Compute geometry + intensity stats for one frame.

    The stats are meaningful on their own (they describe the raw scan) so a
    per-frame annotation record is never empty even when the detector finds no
    boxes on synthetic data.
    """
    pts = np.asarray(points, dtype=np.float32)
    xyz = pts[:, :3]
    intensity = pts[:, 3] if pts.shape[1] > 3 else np.zeros(len(pts), dtype=np.float32)

    mins = xyz.min(axis=0)
    maxs = xyz.max(axis=0)

    # Occupied-voxel count at `voxel_size` m — a cheap density/coverage summary.
    if voxel_size > 0 and len(xyz) > 0:
        voxel_idx = np.floor(xyz / voxel_size).astype(np.int64)
        occupied_voxels = int(np.unique(voxel_idx, axis=0).shape[0])
    else:
        occupied_voxels = 0

    return {
        "point_count": len(pts),
        "feature_count": int(pts.shape[1]),
        "bounds": {
            "x_min": round(float(mins[0]), 4),
            "x_max": round(float(maxs[0]), 4),
            "y_min": round(float(mins[1]), 4),
            "y_max": round(float(maxs[1]), 4),
            "z_min": round(float(mins[2]), 4),
            "z_max": round(float(maxs[2]), 4),
        },
        "intensity": {
            "min": round(float(intensity.min()), 4),
            "max": round(float(intensity.max()), 4),
            "mean": round(float(intensity.mean()), 4),
        },
        "voxel_size": voxel_size,
        "occupied_voxels": occupied_voxels,
    }


def render_bev_png(
    points: np.ndarray,
    *,
    size: int = 640,
    x_range: tuple[float, float] = (-50.0, 50.0),
    y_range: tuple[float, float] = (-50.0, 50.0),
) -> bytes:
    """Render a top-down bird's-eye-view (BEV) PNG of the frame.

    Height (z) is colour-mapped blue -> red over the observed range so a viewer
    can read structure at a glance. Pillow is imported lazily (a base dep).
    """
    from PIL import Image

    pts = np.asarray(points, dtype=np.float32)
    xyz = pts[:, :3]
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]

    keep = (x >= x_range[0]) & (x < x_range[1]) & (y >= y_range[0]) & (y < y_range[1])
    x, y, z = x[keep], y[keep], z[keep]

    img = np.zeros((size, size, 3), dtype=np.uint8)
    if len(x) == 0:
        buf = _encode_png(Image, img)
        return buf

    # World -> pixel. +x forward maps to image-up; +y left maps to image-left.
    px = ((x - x_range[0]) / (x_range[1] - x_range[0]) * (size - 1)).astype(np.int64)
    py = ((y - y_range[0]) / (y_range[1] - y_range[0]) * (size - 1)).astype(np.int64)
    row = size - 1 - px  # forward = up
    col = size - 1 - py  # left = left

    lo, hi = float(z.min()), float(z.max())
    norm = (z - lo) / (hi - lo) if hi > lo else np.zeros_like(z)
    r = (norm * 255).astype(np.uint8)
    b = ((1.0 - norm) * 255).astype(np.uint8)
    g = np.full_like(r, 60)

    img[row, col, 0] = r
    img[row, col, 1] = g
    img[row, col, 2] = b
    return _encode_png(Image, img)


def _encode_png(Image: Any, img: np.ndarray) -> bytes:
    import io

    buf = io.BytesIO()
    Image.fromarray(img, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()
