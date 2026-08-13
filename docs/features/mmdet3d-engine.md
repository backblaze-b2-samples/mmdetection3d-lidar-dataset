<!-- last_verified: 2026-08-13 -->
# Feature: MMDetection3D engine

## Purpose
Run the real OpenMMLab **MMDetection3D** engine locally to produce 3D boxes and point-wise segmentation from a LiDAR frame — with no external provider and B2 credentials only.

## Used By
- UI: engine-status badge on `/runs` and `/runs/[id]`
- API: `GET /engine/status`; the engine runs inside `POST /runs/{id}/execute`

## Core Functions
- `app/engine/device.py` — `resolve_device()`
- `app/engine/engine_status.py` — `engine_available()`, `engine_status()`
- `app/engine/mmdet3d_runner.py` — `run_inference()` (lazy-imports the inferencers)
- `app/engine/point_cloud.py` — numpy-only `.bin` parsing + BEV preview (base-safe)

## Setup (opt-in, heavy)
```bash
pnpm run setup:mmdet3d-engine
```
Installs `services/api/requirements-engine.txt` into the SAME `services/api/.venv`: CPU `torch`, `openmim`, `mmengine`, `mmcv`, `mmdet`, `mmdet3d` (+ optional `open3d` for `.pcd`). `mmcv` builds from source on macOS arm64 (slow). NOT run by base `pnpm run setup`; every engine import is lazy so the base app + `pnpm verify` stay green without it.

## Device policy (`deployment: local`)
`resolve_device("auto")` picks the first available of **CUDA → CPU** and defaults to CPU. **MPS is deliberately skipped on the auto path** — mmcv/mmdet3d MPS support is weak/incomplete and sparse-conv ops have no MPS kernels. An explicit `MMDET3D_DEVICE=mps` is honoured for users who know their build works. No unconditional `.cuda()`; a missing GPU is never fatal.

## Model zoo (finite Select)
| Alias | Dataset | Notes |
|-------|---------|-------|
| `pointpillars` (default) | KITTI 3-class | CPU-friendly — the recommended default |
| `second` | KITTI | uses sparse-conv (`spconv`) — generally needs CUDA/Linux |
| `centerpoint` | nuScenes | uses sparse-conv (`spconv`) — generally needs CUDA/Linux |

Task `segmentation` resolves to a dedicated point-segmentation model (MinkUNet / SemanticKITTI) regardless of the detection-model Select. `MMDET3D_MODEL_CONFIG` / `MMDET3D_MODEL_CHECKPOINT` override the resolved model.

## Data & license
The seed defaults to **procedurally-synthetic** KITTI-format frames (zero third-party data committed, fully offline). `MMDET3D_USE_DEMO_DATA=1` fetches MMDetection3D's upstream KITTI demo frame at runtime — KITTI is **CC BY-NC** (non-commercial), fetched for local demo/eval only and never redistributed by this repo.

## Edge Cases
- Engine absent → `engine_available()` returns False (never raises); `/engine/status` badge shows "not installed"; `execute` → 503 with an install hint.
- `.pcd` without `open3d` → clear actionable error, not a bare ImportError.

## Verification
- Test files: `services/api/tests/test_lidar_engine.py`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_lidar_engine.py`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: base suite green without the engine; `import mmdet3d, mmdet, mmcv, torch` succeeds after `setup:mmdet3d-engine`.

## Related Docs
- [Detection Runs](detection-runs.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
