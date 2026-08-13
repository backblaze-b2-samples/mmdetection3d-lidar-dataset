<!-- last_verified: 2026-08-13 -->
# App Workflows

User journeys inside the application.

## Ingest a LiDAR sensor log

- User navigates to `/upload` (Ingest)
- Enters a `sensor_id` and acquisition `date`, and selects one or more KITTI `.bin` / `.pcd` frames
- Each frame uploads **directly from the browser to B2** under `raw/<sensor_id>/<date>/` (presigned PUT); a `.bin` whose byte length isn't a float32 multiple is rejected
- On success: a toast whose **"Create run →"** action deep-links straight to `/runs?sensor=<id>` with that exact sensor log preselected — a one-click hand-off, so the user never has to re-find "Runs" in the sidebar and re-pick the sensor. The log is also selectable on the Runs create form as before.
- See: [LiDAR ingest](features/lidar-ingest.md)

## Create and run a Detection Run

- User navigates to `/runs`
- Fills the create form: label (free text), sensor log (Select, from B2), model (`pointpillars`/`centerpoint`/`second`), task (`detection`/`segmentation`), score threshold, val split, device — the form surfaces safe defaults as guidance (try `pointpillars` / `detection` / `0.3` on the seeded demo log)
- Submits → a `pending` run is created and the user lands on `/runs/<id>`
- The engine-status badge shows whether MMDetection3D is installed; if not, running the run fails loudly with an install hint (never a fake result)
- User clicks **Run detection** → the run goes `running` (live progress + polling), then `done`: each frame shows a bird's-eye-view preview and its 3D-box annotations, and the dataset manifest + checkpoint record are downloadable from B2. While `running`, the progress card names the determinate scope — "Processing N frames on `<DEVICE>`…" from the sensor log's frame count — alongside the elapsed counter and an advancing **"Frame X of N"** with a determinate bar, so a multi-minute CPU run shows real headway (X counts the annotation objects already written, read-only) rather than an open-ended spinner
- User can **Edit** (label / model / task / threshold / val_split / device, then re-run) or **Delete** (removes only this run's derived artifacts)
- See: [Detection Runs](features/detection-runs.md), [MMDetection3D engine](features/mmdet3d-engine.md)

## Browse the Dataset

- User navigates to `/dataset`
- Sees every object this app wrote to B2, scoped to the sample prefix and grouped by pipeline stage (raw, preprocessed, annotations, datasets, checkpoints, runs), each with counts + sizes and a per-object download
- The full-bucket `/files` explorer stays available for everything else
- See: [File Browser](features/file-browser.md), [Dataset manifest](features/dataset-manifest.md)

## Upload Files

- User navigates to `/upload`
- Drops or selects files in the dropzone
- Client validates file size (max 100MB) and type
- Files upload **directly from the browser to B2** (a presigned PUT). A determinate progress bar tracks the bytes leaving the browser; once they are all sent the row switches to "Verifying upload..." with an *indeterminate* sweeping bar while the API HEADs and magic-byte-sniffs the stored object. That phase has no percentage to report, and a bar parked at a full 100% read as finished-but-stuck
- On success: toast notification, green checkmark, and a "View in Files" link through to the browser
- On failure: red status icon with error message
- User can clear completed uploads
- The queue lives in an app-wide provider: navigating to another page keeps the upload running, shows an "Uploading N files" indicator in the header, and keeps the duplicate-upload guard armed
- Reloading or closing mid-upload asks for confirmation first; if the upload dies anyway, the next load says which file didn't finish
- See: [File Upload](features/file-upload.md)

## Browse and Manage Files

- User navigates to `/files`
- Page loads the 100 most recent objects from the API (sorted most recent first). While it loads, the page says so on screen and escalates the wording if the wait runs long — a full bucket listing measured 2.8s-21s cold
- If that limit was hit, a notice states how many objects the bucket actually holds — the page never claims to show everything
- Files displayed in tree view with folders and type-specific icons
- Folders auto-expand on load until the *majority* of the listed files are reachable without clicking, so the page's own "click a file" instruction is always actionable. Stopping at the first visible file was not enough: one stray top-level object left the other 99 sealed in collapsed folders while the page claimed to show 100
- Clicking a file row opens its preview; the per-row actions menu (preview / download / delete) is always visible, on every viewport
- Arriving at `/files?preview=<key>` expands that file's folders and opens its preview directly. This is how the ⌘K palette and the dashboard's recent-uploads rows hand off a *specific* file; the param is consumed on arrival so it doesn't re-fire later
- **Preview**: opens dialog with image/PDF preview + metadata panel, and the file's Download / Delete actions — the advertised "click a file" path offers everything the row menu does. The loading state holds until the media paints; a failure offers "Open in a new tab". The preview URL is signed with `Content-Disposition: inline` so PDFs render in place
- **Download**: shows a pending state on the row plus a toast while the presigned URL is fetched, then starts the download via an anchor click (which, unlike a popup, still works if the click's user activation expired during a slow presign). Failures are reported; the click can never silently do nothing
- **Delete**: the confirmation dialog stays open showing "Deleting..." until the request settles, then the row disappears with the toast (optimistic cache update) and the list reconciles with the server. The dialog is held deliberately — Radix closes on action click by default, which dismissed the only pending state and left the row looking untouched while the delete was still in flight
- Empty bucket shows "No files found" with upload prompt
- See: [File Browser](features/file-browser.md)

## View Dashboard

- User navigates to `/` (home)
- Three parallel API calls load: stats, recent files, upload activity — all served from one shared bucket listing that the API warms at startup
- While stats load, the page states it in words above the cards rather than showing silent skeletons
- Stats cards show: total files, storage used, uploads today, total downloads
- Upload chart shows last 7 days of upload activity as bar chart
- Recent uploads table shows last 10 files with filename, size, type, date. Each filename links to that file's preview on `/files` — `/files` teaches "click a file to preview it", so the same gesture here has to answer rather than being inert text
- Empty state: "No files uploaded yet" messages
- See: [Dashboard](features/dashboard.md)

## Change Preferences

- User navigates to `/settings`
- A banner at the top states that the page is mostly a demonstration: only Theme is wired up for real, the rest showcases what a settings page can look like when you adapt the kit
- **Theme** (real): editing it and saving applies it immediately and persists it (`next-themes`), and the header's theme toggle drives the same state
- **Profile and preference fields** (demo): Display name, Bio, Default file view (Tree/List/Grid), Email me on every upload, Warn me when approaching quota + threshold. Each is labelled "Demo field", persists to `localStorage` only, and drives no behaviour — there is no account system, mailer, quota banner, activity log, or List/Grid view behind them yet
- Saving reports honestly: a success toast that separates the real theme change from the locally-stored demo values, or a warning toast if the browser blocked storage (theme still changes). It never claims a save that did not happen — the original page toasted "Settings saved" for fields that changed nothing
- Danger Zone actions are a demo — no real delete runs
- See: [Settings](features/settings.md)
