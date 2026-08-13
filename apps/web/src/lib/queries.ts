"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  createRun,
  deleteFile,
  deleteRun,
  executeRun,
  getDownloadUrl,
  getEngineStatus,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getPreviewUrl,
  getRun,
  getRuns,
  getSensorLogDates,
  getSensorLogs,
  getUploadActivity,
  ingestFrames,
  updateRun,
  type FrameLogInput,
} from "@/lib/api-client";
import { annotationsPrefix } from "@/lib/sample-prefix";
import type {
  CreateRunRequest,
  FileMetadata,
  FileMetadataDetail,
  RunRecord,
  UpdateRunRequest,
} from "@mmdetection3d-lidar-dataset/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  detail: (key: string) => [...qk.all, "detail", key] as const,
  health: () => [...qk.all, "health"] as const,
  runs: () => [...qk.all, "runs"] as const,
  run: (id: string) => [...qk.all, "runs", id] as const,
  engineStatus: () => [...qk.all, "engine-status"] as const,
  sensorLogs: () => [...qk.all, "sensor-logs"] as const,
  sensorLogDates: (sensorId: string) =>
    [...qk.all, "sensor-logs", sensorId, "dates"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Gate a query on something being open/visible. Deliberately the only option we
 * expose, so callers can't drift the caching policy per call site — the ⌘K
 * palette reuses `useFiles`' key (and therefore its cache) instead of fetching
 * its own private, smaller list.
 */
export interface QueryGate {
  enabled?: boolean;
}

export function useFiles(prefix = "", limit = 100, { enabled = true }: QueryGate = {}) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
    enabled,
  });
}

export function useFileStats({ enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
    enabled,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Drop a deleted object from every cached file list, plus its own cached
 * preview/detail entries.
 *
 * Invalidation alone is not enough: the refetch re-lists the whole bucket and
 * took 5-6s in practice, so the success toast fired while the row was still
 * listed — and using that stale row's Preview 404'd. Editing the cache makes
 * the row disappear with the toast; the invalidation that follows still
 * reconciles against the server.
 *
 * Exported for tests — the mutation below is its only production caller.
 */
export function dropDeletedFileFromCache(qc: QueryClient, fileKey: string) {
  qc.setQueriesData<FileMetadata[]>(
    // Partial key: matches qk.files(prefix, limit) for every prefix/limit.
    { queryKey: [...qk.all, "files"] },
    (previous) =>
      previous ? previous.filter((file) => file.key !== fileKey) : previous,
  );
  // A presigned URL for a deleted key can only 404 now.
  qc.removeQueries({ queryKey: qk.preview(fileKey) });
  qc.removeQueries({ queryKey: qk.detail(fileKey) });
}

/**
 * Fetch a download URL for one file.
 *
 * A mutation, not a query: it has a server side effect (it bumps the download
 * counter) and it must never be cached or replayed. Being a mutation is also
 * what gives the UI an honest pending state — the old code awaited the presign
 * inside a plain click handler, so a slow round trip left the screen completely
 * unchanged and a user could not tell a working download from a dead button.
 *
 * The caller performs the navigation (see `lib/browser-download.ts`) and gets
 * `isPending` / `variables` for the pending row.
 */
export function useDownloadUrl() {
  const qc = useQueryClient();
  return useMutation<{ url: string }, ApiError, FileMetadata>({
    mutationFn: (file) => getDownloadUrl(file.key),
    // The server counted a download, so the dashboard's "Total Downloads" is
    // now stale. Cheap: /files/stats reads a cached bucket listing.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stats() }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: (_data, fileKey) => {
      // Remove the row immediately, then reconcile everything (lists, stats,
      // activity) against the server in the background.
      dropDeletedFileFromCache(qc, fileKey);
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// Ingest raw LiDAR frames as a sensor log. On success the new sensor id + its
// dates appear in the create-run form, so we invalidate the sensor-log caches
// (and the file listing/stats the frames now affect).
export function useIngestFrames() {
  const qc = useQueryClient();
  return useMutation<{ sensorId: string; frames: number }, ApiError, FrameLogInput>({
    mutationFn: (input) => ingestFrames(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sensorLogs() });
      qc.invalidateQueries({ queryKey: [...qk.all, "files"] });
      qc.invalidateQueries({ queryKey: qk.stats() });
    },
  });
}

// --- Detection Runs (primary entity) -------------------------------------

// The engine-status badge. Cheap and side-effect free; polled on focus so a
// freshly-installed engine flips the badge without a manual refresh.
export function useEngineStatus() {
  return useQuery({
    queryKey: qk.engineStatus(),
    queryFn: getEngineStatus,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSensorLogs() {
  return useQuery({ queryKey: qk.sensorLogs(), queryFn: getSensorLogs });
}

export function useSensorLogDates(sensorId: string | undefined) {
  return useQuery({
    queryKey: qk.sensorLogDates(sensorId ?? ""),
    queryFn: () => getSensorLogDates(sensorId as string),
    enabled: !!sensorId,
  });
}

// While ANY run is still pending/running, poll the list so a stuck/stale
// "Running" row auto-advances to Done/Error without a manual refresh.
const ACTIVE_STATUSES = new Set(["pending", "running"]);
const RUN_POLL_MS = 2500;

export function useRuns() {
  return useQuery<RunRecord[], ApiError>({
    queryKey: qk.runs(),
    queryFn: getRuns,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => ACTIVE_STATUSES.has(r.status))
        ? RUN_POLL_MS
        : false,
  });
}

// Poll a single run while it is pending/running so the badge advances to
// Done/Error on its own and the primary action re-enables when it settles.
export function useRun(id: string | undefined) {
  return useQuery<RunRecord, ApiError>({
    queryKey: qk.run(id ?? ""),
    queryFn: () => getRun(id as string),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.has(query.state.data.status)
        ? RUN_POLL_MS
        : false,
  });
}

// Determinate "Frame X of N" while a run executes. Counts the per-frame
// annotation objects already written under annotations/<run_id>/ — a read-only
// list of an EXISTING endpoint (`GET /files?prefix=`), so it adds NO per-frame
// B2 write and write-amplification is untouched. A non-empty prefix is a
// targeted scan (it bypasses the full-bucket listing cache), so each poll is
// cheap. Polls only while `enabled` (status running) and is disabled once the
// run settles, so a finished run stops listing the bucket.
export function useRunProgress(runId: string, enabled: boolean) {
  return useQuery<number, ApiError>({
    queryKey: [...qk.run(runId), "annotation-count"],
    queryFn: async () => (await getFiles(annotationsPrefix(runId), 1000)).length,
    enabled,
    refetchInterval: enabled ? RUN_POLL_MS : false,
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation<RunRecord, ApiError, CreateRunRequest>({
    mutationFn: (body) => createRun(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs() }),
  });
}

export function useUpdateRun(id: string) {
  const qc = useQueryClient();
  return useMutation<RunRecord, ApiError, UpdateRunRequest>({
    mutationFn: (body) => updateRun(id, body),
    onSuccess: (record) => {
      qc.setQueryData(qk.run(id), record);
      qc.invalidateQueries({ queryKey: qk.runs() });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation<
    { deleted: boolean; run_id: string; objects: number },
    ApiError,
    string
  >({
    mutationFn: (id) => deleteRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs() }),
  });
}

// Run / re-run inference. Long-running (real inference), so the mutation's
// pending state drives the button spinner; on success we refresh the detail +
// the list + storage stats (write amplification changed).
export function useExecuteRun(id: string) {
  const qc = useQueryClient();
  return useMutation<RunRecord, ApiError, void, { prev?: RunRecord }>({
    mutationFn: () => executeRun(id),
    // Optimistically flip the cached run to "running" the instant the user
    // clicks, so the status badge is coherent with the button and the poll kicks in.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.run(id) });
      const prev = qc.getQueryData<RunRecord>(qk.run(id));
      if (prev) {
        qc.setQueryData<RunRecord>(qk.run(id), { ...prev, status: "running", error: null });
      }
      return { prev };
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: qk.run(id) });
      qc.invalidateQueries({ queryKey: qk.runs() });
    },
    onSuccess: (record) => {
      qc.setQueryData(qk.run(id), record);
      qc.invalidateQueries({ queryKey: qk.runs() });
      qc.invalidateQueries({ queryKey: qk.stats() });
    },
  });
}
