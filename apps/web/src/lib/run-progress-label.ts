/**
 * Status + progress helpers for the "run in progress" card on `/runs/[id]`.
 *
 * `runProgressLabel` names the determinate SCOPE: the sensor log's known frame
 * count (from `GET /sensor-logs`) plus the resolved device, so a multi-minute
 * CPU run reads as "Processing 40 frames on CPU…" instead of a countless
 * spinner. It falls back to a generic line until the count is known.
 *
 * `frameProgressLabel` / `frameProgressPercent` add the ADVANCING position —
 * "Frame X of N" and a determinate bar width. `X` is the count of per-frame
 * annotation objects already written for the run (`annotations/<run_id>/`),
 * read with a plain prefix list of an *existing* endpoint — no new per-frame
 * B2 read/write, so write-amplification is untouched. Both return null until
 * the processed count and total are known, so the card can keep the scope line
 * plus an indeterminate pulse until the first frame lands.
 */
export function runProgressLabel(
  frameCount: number | undefined,
  device: string | undefined,
): string {
  if (typeof frameCount !== "number" || frameCount <= 0) {
    return "Running MMDetection3D over the sensor log…";
  }
  const frames = `${frameCount} frame${frameCount === 1 ? "" : "s"}`;
  // "auto" is the pre-resolution placeholder — only name a concrete device.
  const on = device && device !== "auto" ? ` on ${device.toUpperCase()}` : "";
  return `Processing ${frames}${on}…`;
}

function known(n: number | undefined): n is number {
  return typeof n === "number";
}

/**
 * Advancing "Frame X of N", or null until both counts are known. `processed`
 * (annotation objects written so far) is clamped to `total` so a late-arriving
 * annotation can never render "Frame 12 of 11".
 */
export function frameProgressLabel(
  processed: number | undefined,
  total: number | undefined,
): string | null {
  if (!known(processed) || !known(total) || total <= 0) return null;
  return `Frame ${Math.min(processed, total)} of ${total}`;
}

/**
 * Determinate bar width (0–100), or null until both counts are known. Clamped
 * so an off-by-one never overflows the track.
 */
export function frameProgressPercent(
  processed: number | undefined,
  total: number | undefined,
): number | null {
  if (!known(processed) || !known(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
}
