<!-- last_verified: 2026-08-13 -->
# Feature: Detection Runs (primary entity)

## Purpose
A **Detection Run** is one MMDetection3D pass over a sensor log's LiDAR frames: it produces per-frame 3D annotations, a dataset manifest, and an archived checkpoint record — the core dataset-preparation loop this sample exists to demonstrate.

## Used By
- UI: `/runs` (create + list), `/runs/[id]` (detail, run, edit, delete)
- API: `GET/POST /runs`, `GET/PATCH/DELETE /runs/{run_id}`, `POST /runs/{run_id}/execute`, `GET /engine/status`, `GET /sensor-logs`, `GET /sensor-logs/{sensor_id}/dates`

## Core Functions
- `app/service/runs.py` — create/read/update/delete/execute orchestration
- `app/service/lidar_dataset.py` — per-frame processing + dataset manifest + checkpoint archival
- `app/repo/runs.py` — B2 persistence + raw-frame discovery
- `app/engine/mmdet3d_runner.py` — the real MMDetection3D inference call

## Canonical Files
- Pattern exemplar: `services/api/app/service/runs.py`

## Inputs
- `label`: string (free text)
- `sensor_id`: string (Select, populated from ingested logs in B2)
- `model`: `pointpillars | centerpoint | second` (Select)
- `task`: `detection | segmentation` (Select)
- `score_threshold`: float 0–1 (numeric input, default 0.3)
- `val_split`: float 0–1 (numeric input, default 0.2)
- `device`: `auto | cpu | cuda | mps` (Select, default auto)

## Outputs
- Run manifest `runs/<run_id>/run.json` (status, config, per-frame results, summary)
- Per-frame annotation JSON, BEV preview PNG, preprocessed `.npz`
- Dataset manifest `datasets/<run_id>/manifest.jsonl`
- Checkpoint record `checkpoints/<model>/checkpoint.json`

## Lifecycle (all five verbs in the UI)
- **create** — `POST /runs` + the create-run form (status `pending`).
- **read** — `GET /runs` (list) and `GET /runs/{id}` (detail: per-frame boxes, previews, manifest/checkpoint links, summary).
- **edit** — `PATCH /runs/{id}` + edit dialog (label / model / task / threshold / val_split / device; the sensor log is fixed — a different log is a new run).
- **delete** — `DELETE /runs/{id}` removes only this run's derived artifacts (`runs/<id>/`, `annotations/<id>/`, `preprocessed/<id>/`, `datasets/<id>/`). Raw frames, shared checkpoints, and other runs are untouched.
- **run** — `POST /runs/{id}/execute` runs MMDetection3D over the log's frames, writes annotations + manifest, and moves status `pending → running → done/error`.

## Checkpoint archival (honest boundary)
The demo does **not train** a model (infeasible on CPU in seconds). It archives a checkpoint record for the active pretrained model to `checkpoints/<model>/` (and the real `.pth` when `MMDET3D_MODEL_CHECKPOINT` points at a local file), and documents that a real training loop would write per-epoch `<epoch>.pth` objects to the same prefix — the "checkpoint after each epoch → B2" storage pattern.

## Edge Cases
- Engine not installed → `execute` returns 503 with an install hint and marks the run `error` (never a fabricated result).
- No frames under the sensor log → 422, run marked `error`.
- Detector finds no boxes on synthetic frames → annotation still records geometry stats + split (a valid, non-empty record).

## UX States
- Empty (no runs) → EmptyState with a create prompt.
- Running → live progress card + polling; the primary action disables so no second concurrent run launches.
- Error → destructive alert with the server message.

## Verification
- Test files: `services/api/tests/test_lidar_engine.py` (split, model-resolution, aggregate), plus the OpenAPI contract tests.
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_lidar_engine.py`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: CRUD + execute wired end-to-end; base suite green without the engine; a real run (engine installed) writes annotations + manifest to B2.

## Related Docs
- [MMDetection3D engine](mmdet3d-engine.md)
- [Dataset manifest](dataset-manifest.md)
- [LiDAR ingest](lidar-ingest.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
