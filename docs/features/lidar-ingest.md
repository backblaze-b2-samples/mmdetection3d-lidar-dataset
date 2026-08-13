<!-- last_verified: 2026-08-13 -->
# Feature: LiDAR ingest

## Purpose
Upload raw LiDAR point-cloud frames (KITTI `.bin` / `.pcd`) straight to B2 as a named **sensor log**, so they feed the detection pipeline and become selectable in the create-run form.

## Used By
- UI: `/upload` (the "Ingest a LiDAR sensor log" form), plus the generic full-bucket uploader below it
- API: `POST /frames/presign`, `POST /frames/verify`

## Core Functions
- `app/service/frame_ingest.py` — `create_frame_presign()`, `verify_frame()`
- `app/repo/b2_upload.py` — `generate_presigned_upload()`
- frontend `lib/api-client.ts` — `ingestFrames()`

## Flow
- Client declares `sensor_id`, `date`, and one or more `.bin`/`.pcd` files.
- `POST /frames/presign` validates the sensor id (regex), date (`YYYY-MM-DD`), and size, then signs a direct-to-B2 PUT to `raw/<sensor_id>/<date>/<frame>`.
- The browser PUTs the bytes **directly to B2** (bytes never traverse the API — no Vercel payload ceiling).
- `POST /frames/verify` HEADs the stored object; a `.bin` whose byte length isn't a multiple of 4 (float32 stride) is deleted and rejected.

## Key layout
```
mmdetection3d-lidar-dataset/raw/<sensor_id>/<date>/<frame>.bin
```
A "sensor log" is the collection of frames under one `sensor_id` (across dates). `GET /sensor-logs` lists them for the create-run form.

## Edge Cases
- Non-`.bin`/`.pcd` extension → 415.
- Empty or oversized file → 400 / 413.
- A `.bin` with a byte length not divisible by 4 → 415 (not a valid KITTI float32 frame).

## Verification
- Focused verify command: `cd services/api && .venv/bin/python -m pytest`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: a seeded/ingested sensor log appears in `GET /sensor-logs` and the create-run Select.

## Related Docs
- [Detection Runs](detection-runs.md)
- [Metadata Extraction](metadata-extraction.md)
- [File Upload](file-upload.md)
