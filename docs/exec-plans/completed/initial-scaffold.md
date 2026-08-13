# Build plan — `mmdetection3d-lidar-dataset`

Scaffold a new B2 sample from **vibe-coding-starter-kit** that demonstrates a LiDAR
3D-detection **dataset-preparation pipeline** on Backblaze B2, running **MMDetection3D**
locally.

**Source of truth (starter kit):** `.claude/scratch/vcsk-8fe87cfc-24c4-450b-ae45-877344be029d/`
(already cloned fresh by the skill). Do NOT read any sibling checkout.

**In-repo template to mirror (patterns only — do NOT copy files from it):** the builder
should follow the exact structural conventions of the OpenMMLab-family sibling
`satellite-change-detection-open-cd` (opt-in engine-requirements split, `engine/`
module, `runs` primary-entity CRUD+run lifecycle, lazy engine imports, numpy<2 ABI
pin). Those conventions are transcribed below so the builder does not need that tree.

---

## 1. Purpose

`mmdetection3d-lidar-dataset` is a dataset-preparation pipeline for autonomous-vehicle and
robotics teams who build **3D object-detection / segmentation datasets** from raw LiDAR
point-cloud collections. Raw scans (`.bin` / `.pcd`) are **ingested** to B2, MMDetection3D
runs **locally** to produce per-frame 3D bounding-box + segmentation **annotations**, model
**checkpoints** are archived to B2, and a **dataset manifest JSONL** ties every frame to its
annotation and train/val split — all accessed over the **S3-compatible API**. B2 is the
storage layer for raw scans, preprocessed tensors, annotations, checkpoints, and manifests;
the sample runs on local OSS with **B2 credentials only — no second API key**.

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling — strip what this app doesn't need, keep the reusable
B2-backed scaffolding, add the LiDAR/MMDetection3D domain on top.

### KEEP (as-is — starter contract, non-negotiable)
- **UI kit / design system** — `apps/web/src/components/ui/`, `globals.css` design tokens,
  `/design` reference page. Never edit generated `ui/` files; restyle via tokens only.
- **Full-bucket File Explorer** — `/files` route, `apps/web/src/app/files/`,
  `apps/web/src/components/files/`, and the **Files** sidebar entry. **Never removable.**
- **Upload** — `/upload` route + `apps/web/src/components/upload/` (relabel the nav entry
  "Ingest"; the route stays `/upload`). This is how raw LiDAR frames are ingested to B2.
- **Settings** — keep the honest "mostly a demo" page + `DangerZone`. Only Theme is real.
- **Backend layering** `types → config → repo → service → runtime`; TanStack Query hooks in
  `lib/queries.ts` (no bare `useEffect+fetch`); no boto3 outside `repo/`; OpenAPI contract
  (`docs/api/openapi.json`) re-exported on every route change; agent-docs gate.
- **Shared infra** — `list_cache.py`, `counter.py`, `b2_object.py`, `b2_upload.py`, presign
  flow, rate limiting, health, metrics.

### TRIM (remove / repurpose from starter)
- **Dashboard illustrative content** — replace `dashboard/` stats-cards, upload-chart,
  recent-uploads-table with LiDAR-domain metrics (see §4). This is the one screen explicitly
  meant to be rewritten. Repurpose, don't just delete.
- **Metadata extraction** — the starter's generic `service/metadata.py` (PDF/image EXIF)
  becomes **point-cloud frame metadata** (point count, xyz bounds, intensity stats, frame
  format). Rewrite; don't delete.
- **`e2e/upload.spec.ts`** — keep but adapt copy/paths if branding strings are asserted.
- Nothing else structural is removed — the starter is lean already.

### ADD (new for this sample)
- **`services/api/app/engine/`** (new layer, mirrors open-cd):
  - `device.py` — `resolve_device("auto")` → first available of **CUDA → CPU**. **MPS
    deliberately skipped on the auto path** (mmcv/mmdet3d MPS support is weak/incomplete);
    honor an explicit `MMDET3D_DEVICE=mps`. Default CPU. `torch` optional (lazy).
  - `engine_status.py` — `engine_available()` tries importing `torch`, `mmcv`, `mmdet`,
    `mmdet3d` and returns a bool (never raises); `engine_status()` → dict for the
    `GET /engine/status` badge. Cheap, side-effect free, runs no inference.
  - `point_cloud.py` — read a KITTI-format `.bin` (numpy `float32` reshaped `(-1,4)` =
    x,y,z,intensity) and compute frame stats (point count, bounds, intensity min/max/mean,
    voxel-grid summary). `.pcd` support is engine-optional (open3d) — document the limit.
    numpy-only so it works in the **base** app (previews/metadata) without the heavy engine.
  - `mmdet3d_runner.py` — **lazy-imports** MMDetection3D's `LidarDet3DInferencer` (detection)
    / `Seg3DInferencer` (segmentation), resolves model alias → config+checkpoint, runs on the
    resolved device, returns 3D boxes (`bbox_3d`, `labels_3d`, `scores_3d`) + optional
    point-wise segmentation labels. Every heavy import is inside the function body so the base
    app, `pytest`, and `pnpm build` stay green **without** the engine installed.
- **Primary entity: Detection Run** (`/runs`, `/runs/[id]`) — full CRUD+run lifecycle
  (see §4). Backend `types/runs.py`, `service/runs.py`, `repo/runs.py`, `runtime/runs.py`;
  frontend `app/runs/page.tsx`, `app/runs/[id]/page.tsx`, `components/runs/`.
- **Sample-scoped asset explorer** — a new **Dataset** page (`/dataset`) that browses ONLY
  objects under the sample prefix `mmdetection3d-lidar-dataset/`, grouped by pipeline stage
  (`raw/`, `preprocessed/`, `annotations/`, `checkpoints/`, `datasets/`). Reuse the
  file-browser primitives with a prefix-scoped backend param. This is the required
  sample-specific explorer and doubles as the "Serve/Query" surface (browse the manifest +
  frames). The full-bucket `/files` explorer stays untouched alongside it.
- **Seed script** — `scripts/seed_lidar.py` (invoked by a `pnpm run seed`): uploads a small
  demo **sensor log** of LiDAR frames to `mmdetection3d-lidar-dataset/raw/<sensor_id>/<date>/`.
  DEFAULT = **procedurally-generated synthetic** KITTI-format frames (ground plane + a few
  box clusters + intensity noise), so the sample is reproducible from a fresh clone **offline
  with zero third-party data bundled**. Optional `MMDET3D_USE_DEMO_DATA=1` = fetch the
  MMDetection3D upstream demo `.bin` at runtime (NOT committed) for real KITTI-style
  detections; document the KITTI CC BY-NC license and that it is fetched for local demo/eval
  only, never redistributed. **The repo commits zero third-party point clouds.**
- **Engine setup** — `requirements-engine.txt` + `scripts/setup-mmdet3d-engine.sh` +
  `pnpm run setup:mmdet3d-engine` (installs the heavy OpenMMLab stack into the SAME
  `services/api/.venv`; NOT run by base `pnpm run setup`). Register the new script in
  `scripts/check-agent-docs.mjs` and document it in AGENTS.md / README / dev-workflows.

## 3. B2 surface (all S3-compatible API — no b2-native)

All objects live under the sample prefix `mmdetection3d-lidar-dataset/` (via
`settings.sample_prefix`) so the sample-scoped explorer stays clean and the shared dev bucket
isn't polluted; the full-bucket `/files` explorer remains global.

| Stage | S3 op | Key layout |
|-------|-------|-----------|
| Ingest raw scans | `put_object` (presigned PUT from browser + seed) | `…/raw/<sensor_id>/<date>/<frame>.bin` |
| Preprocess | `put_object` | `…/preprocessed/<run_id>/<frame>.npz` |
| Detect & Segment | `put_object` | `…/annotations/<run_id>/<frame>.json` |
| Checkpoint archive | `put_object` | `…/checkpoints/<model>/<checkpoint>.pth` |
| Dataset manifest | `put_object` | `…/datasets/<run_id>/manifest.jsonl` |
| Serve/Query, explorer, stats | `list_objects_v2`, `head_object` | prefix scans |
| Preview / download | `generate_presigned_url` (GET) | any key |
| Delete run/frame | `delete_object` | run-scoped keys |

**No b2-native API anywhere.** Custom user agent + standard `B2_*` env vars (see §6). This is
the marquee point: massive continuous ingest (millions of frames / several TB per collection
run) plus derived annotations + checkpoints, all on S3-compatible B2.

## 4. Key features (seed README + `docs/features/<feature>.md`)

Primary entity = **Detection Run** (one MMDetection3D pass over a sensor log's frames →
per-frame annotations + a dataset manifest). Persisted as a JSON manifest in B2 at
`…/runs/<run_id>/run.json` — **no database** (mirror open-cd).

1. **LiDAR ingest** (`deployment: local`, no external API) — upload raw `.bin`/`.pcd` frames
   to B2 under `raw/<sensor_id>/<date>/`; a "sensor log" is a named collection of ingested
   frames (the create-run form's log Select is populated from B2).
2. **MMDetection3D detection & segmentation** (`deployment: local`) — run 3D object detection
   (default) and optional semantic segmentation locally. **No external provider — purely
   local OSS.** Inherits the CPU-default / GPU-autodetect hard rule: default CPU, auto-detect
   CUDA → CPU (MPS skipped on auto; mmcv/mmdet3d MPS weak — noted). Models exposed as a
   **finite Select**: `pointpillars` (KITTI, CPU-friendly — DEFAULT), `centerpoint`
   (nuScenes), `second` (KITTI). Note in docs: SECOND/CenterPoint use sparse-conv (`spconv`)
   that generally needs CUDA/Linux; **PointPillars is the CPU default**. Task Select:
   `detection` (default) | `segmentation`.
3. **Per-frame annotations + dataset manifest** — every frame gets an annotation JSON (3D
   boxes: `bbox_3d`/`labels_3d`/`scores_3d`, plus geometry stats so the record is meaningful
   even when the detector finds nothing on synthetic data); a manifest JSONL lists every frame
   → annotation → train/val split.
4. **Checkpoint archival** — upload the active (pretrained) model checkpoint to
   `checkpoints/<model>/` to demonstrate the "checkpoint after each epoch" storage pattern.
   **Honest boundary (document it, like the settings demo):** the demo does not *train* a
   model (infeasible on CPU in seconds); it archives the pretrained checkpoint and notes that
   a real training loop would write per-epoch `.pth` files to the same prefix.
5. **Dataset dashboard** — metrics: frames ingested, runs completed, annotations written,
   total 3D boxes, per-class histogram (chart), storage used, recent runs table. All flow
   `runtime → service → repo` + TanStack Query hooks.

**External API provider:** NONE. Every heavy feature is `deployment: local` (MMDetection3D on
device). No provider key, no per-run API cost — B2 credentials only. (No Genblaze: the
description's stack is local OSS, not a Genblaze/genblaze-* stack.)

### Primary-entity lifecycle (ALL verbs in the UI — mandatory default)
Entity: **Detection Run**. No verb is omitted → `omitted_ui_verbs: []`.
- **create** — `POST /runs` + create-run form.
- **read** — `GET /runs` (list) + `GET /runs/{id}` (detail with per-frame annotations,
  boxes, manifest link, stats).
- **edit** — `PATCH /runs/{id}` + edit form (change label / model / task / threshold /
  val_split; the sensor log is fixed at create — a different log is a new run).
- **delete** — `DELETE /runs/{id}` (removes the run manifest + its derived artifacts under
  `annotations/<run_id>/`, `preprocessed/<run_id>/`, `datasets/<run_id>/`).
- **run** — `POST /runs/{id}/execute` (runs MMDetection3D over the log's frames, writes
  annotations + manifest, sets status pending→running→done/error, records device + stats).

### Form UX conventions
- **Selectors for finite fields** (create AND edit): `model` (pointpillars/centerpoint/second),
  `task` (detection/segmentation), `sensor_log` (Select populated from ingested logs in B2),
  `device` (auto/cpu/cuda/mps) — all `Select`/`RadioGroup`, never free text. `label` is
  free text (open-ended → correct as text). `score_threshold` (0–1) and `val_split` (0–1) are
  numeric inputs with min/max.
- **Create-form defaults as guidance** (placeholder / `FormDescription`, never an autofill
  button): e.g. "Try model **pointpillars**, task **detection**, threshold **0.3** on the
  seeded demo sensor log." Edit form opens pre-filled with the real run. Exemplar to match:
  starter `apps/web/src/components/settings/settings-form.tsx`.

## 5. Doc transforms

- **Rewrite:** `docs/features/dashboard.md` (LiDAR metrics), `docs/features/file-upload.md`
  (LiDAR ingest), `docs/features/metadata-extraction.md` → point-cloud frame metadata,
  `docs/features/file-browser.md` (note the sample-scoped Dataset view alongside full-bucket
  Files), `docs/features/settings.md` (unchanged honesty). README, ARCHITECTURE.md (add the
  `engine/` layer + B2 prefix layout), AGENTS.md (rename, engine commands, doc-map row for the
  engine + runs features), and all three agent shims (`CLAUDE.md`, `GEMINI.md`,
  `.github/copilot-instructions.md`).
- **Add:** `docs/features/detection-runs.md` (the primary entity + CRUD/run + model/task
  Selects + honest training boundary), `docs/features/lidar-ingest.md`,
  `docs/features/mmdet3d-engine.md` (engine setup `setup:mmdet3d-engine`, device policy,
  model zoo + spconv/CUDA notes, KITTI demo-data license note, synthetic-seed default),
  `docs/features/dataset-manifest.md`.
- **Delete:** none.
- `docs/features/_template.md` stays.

## 6. Rename table (`vibe-coding-starter-kit` → `mmdetection3d-lidar-dataset`)

| Kind | From | To |
|------|------|----|
| kebab / repo / dir | `vibe-coding-starter-kit` | `mmdetection3d-lidar-dataset` |
| Title Case (`APP_NAME`) | "Vibe Coding Starter Kit" | "MMDetection3D LiDAR Dataset" |
| `APP_DESCRIPTION` | "File management dashboard template…" | "Build 3D LiDAR detection & segmentation datasets on Backblaze B2 with MMDetection3D" |
| root `package.json` name | `vibe-coding-starter-kit` | `mmdetection3d-lidar-dataset` |
| `apps/web` pkg name | starter | `mmdetection3d-lidar-dataset-web` |
| `packages/shared` pkg name | starter | `@mmdetection3d-lidar-dataset/shared` (match starter scheme) |
| `services/api` pyproject name | starter | `mmdetection3d-lidar-dataset-api` |
| user_agent_extra **and** utm_content (ONE token) | `b2ai-oss-start` | `b2ai-mmdetection3d-lidar-dataset` |
| image tags / workflow slugs / CI name | starter | `mmdetection3d-lidar-dataset` |
| infra (railway/vercel) service names | starter | `mmdetection3d-lidar-dataset` |

The one attribution token must be identical in `user_agent_extra` (b2_client `Config`) and the
`utm_content` of the Backblaze link in `app-sidebar.tsx` (agent-docs gate enforces the match).

## 7. B2 standards — mandatory rename (starter ships the OLD names)

The fresh starter clone still uses the pre-Standard-#3 env names. The build MUST rename to the
canonical `B2_*` names (mirror the current `titiler-cog-map-tiles` / open-cd convention):

| Starter (old) | This sample (Standard #3) |
|---------------|---------------------------|
| `b2_key_id` / `B2_KEY_ID` | `b2_application_key_id` / `B2_APPLICATION_KEY_ID` |
| `b2_application_key` / `B2_APPLICATION_KEY` | unchanged |
| `b2_bucket_name` / `B2_BUCKET_NAME` | unchanged |
| (none) | add `b2_region` / `B2_REGION` |
| `b2_endpoint` / `B2_ENDPOINT` | optional override, empty default; **derive** `https://s3.{b2_region}.backblazeb2.com` via a `settings` property |
| `b2_public_url` / `B2_PUBLIC_URL` | `b2_public_url_base` / `B2_PUBLIC_URL_BASE` (optional) |

Sweep every reference: `settings.py`, `repo/b2_client.py` (`get_s3_client` uses the new names +
derived endpoint + the new `user_agent_extra` token), `.env.example`, README, docs,
`scripts/setup_b2_cors.py`, `scripts/doctor.mjs`, and any test asserting env names. Add
`sample_prefix: str = "mmdetection3d-lidar-dataset/"` to settings and route all sample writes
through it. `B2_PUBLIC_URL_BASE` is OPTIONAL (private-bucket presigned reads work without it) —
do not make it a required/blocking key.

## 8. Requirements split (base green without the engine)

- **`services/api/requirements.txt` (base)** — fastapi, uvicorn[standard], python-multipart,
  python-dotenv, pydantic, pydantic-settings, boto3, plus **`numpy>=1.26,<2`** (used by the
  base `point_cloud.py` for `.bin` parsing/previews AND kept ABI-compatible with the engine's
  numpy<2), plus dev deps (ruff, pytest, pytest-asyncio, httpx). Committed to
  `requirements.lock` (base only), as in the starter.
- **`services/api/requirements-engine.txt` (opt-in, heavy — loose ranges, NOT locked)** —
  `numpy<2`, CPU `torch>=2.1,<2.4` + matching `torchvision`, `openmim`, `mmengine>=0.10`,
  `mmcv>=2.1,<2.2`, `mmdet>=3.0,<3.4`, and the vendor `mmdet3d` (MMDetection3D `>=1.4,<1.5`),
  plus transitive pins that the `mim` resolver tends to miss (`platformdirs>=3.5`, etc.), and
  optional `open3d` for `.pcd`. Install order in `setup-mmdet3d-engine.sh`: `openmim` first,
  then `mim install mmcv==…`, then mmdet/mmdet3d — mirror open-cd's `setup-cd-engine.sh`.
  Document that mmcv builds from source on macOS arm64 (slow) and that
  SECOND/CenterPoint's `spconv` generally needs CUDA/Linux.

**Lazy imports are load-bearing:** nothing under `engine/` (except numpy-only `point_cloud.py`)
may import torch/mmcv/mmdet3d at module top level. `engine_available()` gates the
`/engine/status` badge; `execute` returns a clear 4xx/badge state (not a 500) when the engine
isn't installed. Base `pnpm verify` (lint + tests + typecheck + build) must pass WITHOUT the
engine group.

## 9. Non-negotiables recap (reviewer will gate on these)
- Full-bucket `/files` explorer KEPT **and** a sample-scoped `/dataset` explorer ADDED.
- All five Detection-Run verbs (create/read/edit/delete/run) built in the UI.
- Finite fields use Selects; create form surfaces safe-default guidance (no autofill button).
- S3-only, custom UA token in both places, Standard #3 `B2_*` env names, `sample_prefix`.
- Base app/tests/build green without the heavy engine (lazy imports + requirements split).
- Zero third-party point clouds committed; synthetic seed default; KITTI demo data is an
  optional runtime download with a documented non-commercial license note.
- OpenAPI contract re-exported; agent-docs gate green; docs updated in the same change.
