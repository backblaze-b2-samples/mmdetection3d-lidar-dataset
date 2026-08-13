"""Seed a small demo sensor log of LiDAR frames to B2.

By DEFAULT this generates **procedurally-synthetic** KITTI-format frames (a
ground plane + a few box-shaped clusters + intensity noise), so the sample is
reproducible from a fresh clone offline with ZERO third-party data bundled. The
synthetic frames exercise the whole ingest -> detect -> annotate -> manifest
pipeline; a KITTI-trained detector may find few/no boxes on them (that's fine —
each frame still gets real geometry stats + a manifest entry).

Set `MMDET3D_USE_DEMO_DATA=1` to fetch MMDetection3D's upstream demo KITTI `.bin`
at runtime (NOT committed) for a real KITTI-style scene. KITTI is distributed
under CC BY-NC (non-commercial) — it is fetched for local demo/eval only and
never redistributed by this repo.

Layout written:
    <PREFIX>raw/<sensor_id>/<date>/frame_000.bin
    <PREFIX>raw/<sensor_id>/<date>/frame_001.bin
    ...

Usage (after `pnpm run setup` and a filled-in .env):
    services/api/.venv/bin/python scripts/seed_lidar.py            # dry run
    services/api/.venv/bin/python scripts/seed_lidar.py --apply    # upload synthetic
    MMDET3D_USE_DEMO_DATA=1 services/api/.venv/bin/python scripts/seed_lidar.py --apply
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "services" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.config import settings  # noqa: E402
from app.repo import runs as repo  # noqa: E402

N_FRAMES = 4
POINTS_PER_FRAME = 12_000
# MMDetection3D ships a KITTI demo cloud in its demo/ tree.
DEMO_URLS = [
    "https://github.com/open-mmlab/mmdetection3d/raw/main/demo/data/kitti/000008.bin",
]


def out(message: str) -> None:
    """Structured-logging-friendly stdout writer (no bare print(); ruff T20)."""
    sys.stdout.write(f"{message}\n")


def _synthetic_frame(rng: np.random.Generator) -> bytes:
    """A KITTI-format (N, 4) float32 frame: ground plane + box clusters."""
    n_ground = int(POINTS_PER_FRAME * 0.75)
    # Ground plane: broad x/y spread, near-zero z, low intensity.
    gx = rng.uniform(-40, 40, n_ground)
    gy = rng.uniform(-20, 20, n_ground)
    gz = rng.normal(-1.7, 0.05, n_ground)  # sensor ~1.7m above ground
    gi = rng.uniform(0.0, 0.2, n_ground)
    ground = np.stack([gx, gy, gz, gi], axis=1)

    clusters = [ground]
    n_boxes = int(rng.integers(3, 6))
    per_box = (POINTS_PER_FRAME - n_ground) // n_boxes
    for _ in range(n_boxes):
        cx = rng.uniform(-25, 25)
        cy = rng.uniform(-12, 12)
        dx, dy, dz = rng.uniform(1.5, 4.0), rng.uniform(1.5, 2.0), rng.uniform(1.4, 1.8)
        bx = rng.uniform(cx - dx / 2, cx + dx / 2, per_box)
        by = rng.uniform(cy - dy / 2, cy + dy / 2, per_box)
        bz = rng.uniform(-1.7, -1.7 + dz, per_box)
        bi = rng.uniform(0.4, 0.9, per_box)
        clusters.append(np.stack([bx, by, bz, bi], axis=1))

    frame = np.concatenate(clusters, axis=0).astype(np.float32)
    rng.shuffle(frame)
    return frame.tobytes()


def _synthetic_plan(prefix: str, sensor: str, date: str) -> list[tuple[str, bytes]]:
    rng = np.random.default_rng(20240101)
    plan = []
    for i in range(N_FRAMES):
        key = f"{prefix}raw/{sensor}/{date}/frame_{i:03d}.bin"
        plan.append((key, _synthetic_frame(rng)))
    return plan


def _demo_plan(prefix: str, sensor: str, date: str) -> list[tuple[str, bytes]]:
    plan = []
    for i, url in enumerate(DEMO_URLS):
        out(f"Fetching KITTI demo frame (CC BY-NC, not redistributed): {url}")
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = resp.read()
        key = f"{prefix}raw/{sensor}/{date}/demo_{i:03d}.bin"
        plan.append((key, data))
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Upload to B2 (default: dry run).")
    parser.add_argument("--sensor", default=settings.mmdet3d_demo_sensor, help="Sensor id.")
    parser.add_argument("--date", default=settings.mmdet3d_demo_date, help="Acquisition date.")
    args = parser.parse_args()

    if args.apply and not settings.b2_bucket_name:
        sys.stderr.write("B2_BUCKET_NAME is not set — configure .env first.\n")
        return 2

    prefix = settings.sample_prefix
    use_demo = os.environ.get("MMDET3D_USE_DEMO_DATA", "").strip() in ("1", "true", "yes")
    kind = "REAL KITTI demo (CC BY-NC, fetched at runtime)" if use_demo else "SYNTHETIC (offline)"

    if use_demo:
        plan = _demo_plan(prefix, args.sensor, args.date)
    else:
        plan = _synthetic_plan(prefix, args.sensor, args.date)

    total = sum(len(b) for _, b in plan)
    out(f"Sensor log: {args.sensor}/{args.date}   Data: {kind}")
    out(f"Frames: {len(plan)} objects, {total} bytes total")
    for key, body in plan:
        out(f"  {'UPLOAD' if args.apply else 'PLAN'}: {key} ({len(body)} bytes)")

    if not args.apply:
        out("\nDry run — re-run with --apply to upload to B2.")
        return 0

    for key, body in plan:
        repo.put_artifact(key, body, "application/octet-stream")
    out(f"\nUploaded {len(plan)} frames to bucket '{settings.b2_bucket_name}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
