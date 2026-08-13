/**
 * Deep-linking the create-run form to a just-ingested sensor log.
 *
 * After ingesting frames on `/upload`, the success toast offers a one-click
 * "Create run →" that lands on `/runs` with that exact sensor log already
 * selected — so the user doesn't have to find "Runs" in the sidebar and re-pick
 * the sensor they just uploaded. Mirrors the `/files?preview=<key>` hand-off.
 */

/** Query param carrying the sensor id to preselect in the create-run form. */
export const SENSOR_PARAM = "sensor";

/** Link target that opens the create-run form with `sensorId` preselected. */
export function createRunHref(sensorId: string): string {
  return `/runs?${SENSOR_PARAM}=${encodeURIComponent(sensorId)}`;
}

/**
 * Read the requested sensor id from the current URL — idempotently.
 *
 * Deliberately reads `window.location` rather than `useSearchParams()`, for the
 * same reason as `takePreviewKeyFromUrl`: `/runs` is prerendered static and
 * `useSearchParams()` in a client component would force a Suspense boundary.
 *
 * It must NOT consume the param (no `history.replaceState`): under Next dev's
 * React StrictMode the create-run form mounts twice, and a consume-on-mount
 * read let the throwaway first mount strip `?sensor=`, so the surviving second
 * mount read null and the preselect silently failed. Reading without stripping
 * is idempotent — both mounts see the id and the survivor preselects it. The
 * form applies it once (stable effect deps), so a leftover `?sensor=` in the URL
 * never clobbers a later manual sensor change. (Leaving the param is harmless.)
 */
export function readSensorIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(SENSOR_PARAM) || null;
}
