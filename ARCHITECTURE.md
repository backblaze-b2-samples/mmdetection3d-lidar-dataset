<!-- last_verified: 2026-08-06 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard: LiDAR overview stat cards + per-class distribution chart
  - Detection Runs (`/runs`, `/runs/[id]`) — the primary entity: create/read/edit/delete/run
  - Ingest (`/upload`) — upload raw LiDAR frames to B2 as sensor logs
  - Dataset (`/dataset`) — sample-scoped explorer grouped by pipeline stage
  - File browser (`/files`) — full-bucket explorer with preview, download, delete
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for LiDAR ingest, detection runs, listing, deletion
  - B2 S3 integration via boto3 (all sample writes under `settings.sample_prefix`)
  - Point-cloud frame metadata (point count, xyz bounds, intensity)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing + Prometheus-format metrics
- **services/api/app/engine/** — local MMDetection3D engine (lazy-imported)
  - `device.py` — CPU-default / CUDA-autodetect device resolution (MPS skipped on auto)
  - `engine_status.py` — cheap importability probe for the `/engine/status` badge
  - `point_cloud.py` — numpy-only KITTI `.bin` parsing, frame stats, BEV preview (base-safe)
  - `mmdet3d_runner.py` — lazy-imports MMDetection3D's LiDAR inferencers
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (FileMetadata, RunRecord, etc.)
    config/                Settings loaded from environment (incl. sample_prefix)
    repo/                  B2 S3 client + run/frame persistence (data access layer)
    service/               Business logic (runs, lidar_dataset, frame_ingest, upload, files)
    engine/                Local MMDetection3D engine (not a layer; lazy-imported by service/)
    runtime/               FastAPI route handlers
  tests/                   pytest tests (structural + integration)
```

`engine/` sits outside the `types -> config -> repo -> service -> runtime`
layering: it holds the heavy local model code, is imported only by `service/`,
and its imports are lazy so the base app boots without torch/mmdet3d. The
300-line file cap still applies to it.

### B2 object layout (all under `settings.sample_prefix` = `mmdetection3d-lidar-dataset/`)

```
raw/<sensor_id>/<date>/<frame>.bin       ingested raw LiDAR frames (S3 put_object, presigned)
preprocessed/<run_id>/<frame>.npz        preprocessed tensors
annotations/<run_id>/<frame>.json        per-frame 3D boxes / segmentation
datasets/<run_id>/manifest.jsonl         dataset manifest (frame -> annotation -> split)
checkpoints/<model>/checkpoint.json      archived checkpoint record (+ .pth when local)
runs/<run_id>/run.json                   run manifest (no database)
runs/<run_id>/previews/<frame>.png       bird's-eye-view previews
```

The full-bucket `/files` explorer stays global; the `/dataset` explorer is
scoped to this prefix. Deletes are strictly prefix-scoped to one run and never
touch raw frames or other runs.

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. The versioned per-service configs and the human-approved
  staging/production contract live in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — one project using [Vercel Services](https://vercel.com/docs/services):
  the `web` (Next.js) and `api` (FastAPI) services build from the same repo and
  share one origin — the web app at `/`, the API under `/api`. The repo-root
  `vercel.json` declares both services and routes `/api/*` to the API service;
  the Vercel-only `services/api/index.py` strips the `/api` prefix so FastAPI
  keeps its native paths (`/health`, `/files`, …). Uploads go directly from the
  browser to B2 via a presigned PUT (see
  [File Upload](docs/features/file-upload.md)), so they bypass the Function's
  4.5 MB payload ceiling entirely — the bucket must allow the deploy origin in
  its CORS. A two-separate-Projects alternative and the full delivery contract
  live in [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API)
  - All uploaded files stored in a single bucket
  - File listing and metadata via S3 `list_objects_v2` / `head_object`
  - No application database — B2 is the sole data store

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Ingest**: Browser -> `POST /frames/presign` (validates sensor id/date + signs a PUT) -> Browser PUTs the `.bin`/`.pcd` bytes **directly to B2** under `raw/<sensor_id>/<date>/` -> `POST /frames/verify` (HEAD + size/stride check)
- **Create run**: Browser -> `POST /runs` -> service writes a `run.json` manifest to B2 (status `pending`)
- **Run (execute)**: Browser -> `POST /runs/{id}/execute` -> service resolves device, checks the engine is importable (else a 503 with an install hint — never fake-green), lists the sensor log's frames, runs MMDetection3D per frame, writes annotations + previews + preprocessed tensors + a dataset manifest + a checkpoint record to B2, and updates the run manifest to `done`
- **List/read/edit/delete run**: `GET /runs`, `GET /runs/{id}`, `PATCH /runs/{id}`, `DELETE /runs/{id}` (delete is prefix-scoped to the run's derived artifacts)
- **List / Download / Delete files**: unchanged S3 `list_objects_v2` / presigned GET / `delete_object` via the repo layer

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Primary-entity handler: `services/api/app/runtime/runs.py`
- Primary-entity orchestration: `services/api/app/service/runs.py` + `service/lidar_dataset.py`
- Local engine: `services/api/app/engine/` (`mmdet3d_runner.py`, `point_cloud.py`, `device.py`)
- Run + frame persistence (repo layer): `services/api/app/repo/runs.py`
- Layered upload handler: `services/api/app/runtime/upload.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`files.py`, `upload.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Detection Runs](docs/features/detection-runs.md)
- [MMDetection3D engine](docs/features/mmdet3d-engine.md)
- [LiDAR ingest](docs/features/lidar-ingest.md)
- [Dataset manifest](docs/features/dataset-manifest.md)
- [File Upload](docs/features/file-upload.md)
- [File Browser](docs/features/file-browser.md)
- [Dashboard](docs/features/dashboard.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
