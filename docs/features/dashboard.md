<!-- last_verified: 2026-07-28 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the LiDAR dataset pipeline: frames ingested, runs completed, 3D boxes, write amplification, storage used, a per-class distribution chart, and the recent detection runs.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /runs`, `GET /sensor-logs`, `GET /files/stats`

## Core Functions
- `apps/web/src/components/dashboard/lidar-overview.tsx` — 5 stat cards (frames ingested, runs completed, 3D boxes, write amplification, storage used)
- `apps/web/src/components/dashboard/class-distribution.tsx` — bar chart of 3D boxes by class across all runs
- `apps/web/src/components/runs/run-table.tsx` — recent detection runs (reused on the dashboard)
- `apps/web/src/lib/queries.ts` — `useRuns()`, `useSensorLogs()`, `useFileStats()`
- `services/api/app/service/runs.py` — run + sensor-log aggregation
- `services/api/app/repo/list_cache.py` — the shared bucket listing both stats and `/files` read, so nothing scans twice

## Canonical Files
- Dashboard overview: `apps/web/src/components/dashboard/lidar-overview.tsx`
- Run aggregation: `services/api/app/service/runs.py`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /runs` → `RunRecord[]` — drives runs completed, 3D boxes, write amplification, the class-distribution chart, and the recent-runs table
- `GET /sensor-logs` → `SensorLogInfo[]` — frames ingested + sensor-log count
- `GET /files/stats` → `UploadStats` — storage used / object count

## Flow
- Page loads → parallel API calls (`/runs`, `/sensor-logs`, `/files/stats`), all through TanStack Query hooks
- Stat cards display frames ingested, runs completed, 3D boxes, write amplification (derived/source bytes), and storage used
- The class-distribution chart sums each run's per-class 3D-box histogram — the dataset-balance view a labelling team cares about
- The recent-runs table lists runs with status, model, task, frame count, and box count; each row links to `/runs/<id>`
- While any run is pending/running the runs list polls so a finished run flips to Done/Error without a manual refresh

## Edge Cases
- API unavailable → error states with retry where supported; activity chart does not show a false zero state while loading
- No files uploaded → empty chart message, empty table message
- Large file count → stats endpoint paginates through all objects using `ContinuationToken`; the result is cached, so the cost is paid once (at startup) rather than per page view
- Bucket changed by something other than this app → numbers can lag by up to `LIST_CACHE_TTL_SECONDS` (default 300s). The app's own uploads/deletes invalidate the cache, so they are never stale

## UX States
- Loading: an on-screen "Loading bucket stats…" notice above the cards (escalating at 4s and 12s), with skeleton placeholders for cards, table, and upload activity chart
- Empty: "No files uploaded yet" / "No upload data available yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: `services/api/tests/test_upload_activity.py`, `services/api/tests/test_recent_files.py`, `services/api/tests/test_list_cache.py`, `apps/web/src/lib/loading-progress.test.ts`
- Required cases: stats with files, stats with empty bucket, API error fallback, cached listing reused across stats and listing calls, loading copy escalating at its thresholds
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
