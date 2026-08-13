<!-- last_verified: 2026-08-13 -->
# Feature: Dataset manifest

## Purpose
Tie every LiDAR frame in a run to its annotation and a train/val split, so the run's output is a ready-to-train **dataset** — not just loose annotation files.

## Used By
- UI: `/runs/[id]` (download link), `/dataset` (browse under `datasets/`)
- API: written by `POST /runs/{id}/execute`; downloaded via presigned GET

## Core Functions
- `app/service/lidar_dataset.py` — `write_dataset_manifest()`, `process_frame()`
- `app/service/runs.py` — `_split_for()` (deterministic train/val assignment)

## Outputs
- `datasets/<run_id>/manifest.jsonl` — one JSON object per line:
  ```json
  {"frame": "frame_000.bin", "raw_key": "…/raw/…/frame_000.bin", "annotation_key": "…/annotations/<run_id>/frame_000.json", "split": "train", "num_boxes": 0, "point_count": 12000}
  ```
- `annotations/<run_id>/<frame>.json` — per-frame 3D boxes (`bbox_3d` = `[x,y,z,dx,dy,dz,yaw]`, `label_3d`, `score_3d`), optional segmentation class counts, and geometry stats.

## Train/val split
`_split_for(index, val_split)` is deterministic and spread: with `val_split = 0.2`, every 5th frame is assigned to `val`; `val_split = 0` puts all frames in `train`. The split is recorded per frame in the manifest and rolled up in the run summary (`train_frames` / `val_frames`).

## Edge Cases
- Zero frames → an empty manifest object is still written for the run.
- A frame with no boxes → still listed in the manifest with `num_boxes: 0` and its geometry stats in the annotation.

## Verification
- Test files: `services/api/tests/test_lidar_engine.py` (`_split_for`, `_aggregate`)
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: after a run, `datasets/<run_id>/manifest.jsonl` lists every processed frame with a split.

## Related Docs
- [Detection Runs](detection-runs.md)
- [Dashboard](dashboard.md)
