/**
 * The B2 key prefix every object this sample writes lives under — mirrors
 * `settings.sample_prefix` on the API (`MMDET3D_PREFIX`). Kept in one place so
 * the Dataset explorer and the run-progress poll agree on the exact prefix.
 */
export const SAMPLE_PREFIX = "mmdetection3d-lidar-dataset/";

/**
 * Prefix under which a run's per-frame annotation objects are written
 * (`annotations/<run_id>/<frame>.json`). Counting the objects here versus the
 * sensor log's `frame_count` yields a determinate "Frame X of N" during a run,
 * with no new per-frame B2 write — write-amplification stays untouched.
 */
export function annotationsPrefix(runId: string): string {
  return `${SAMPLE_PREFIX}annotations/${runId}/`;
}
