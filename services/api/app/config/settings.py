from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Standardized B2_* names (parent standard #3). The S3 endpoint is DERIVED
    # from the region (see the `b2_endpoint` property) so there is one source of
    # truth and no region string is ever hardcoded in source.
    b2_region: str = ""
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # Optional: only used to build public object URLs for a public bucket. The
    # app runs fine without it, so it is never required at startup.
    b2_public_url_base: str = ""

    # --- MMDetection3D LiDAR dataset pipeline ---
    # Root prefix under which every raw scan and derived run artifact lives in
    # B2, so the sample-scoped Dataset explorer stays clean and the shared dev
    # bucket isn't polluted. The full-bucket /files explorer remains global.
    mmdet3d_prefix: str = "mmdetection3d-lidar-dataset/"
    # Device selection: auto -> CUDA, then CPU (default CPU). mmcv/mmdet3d MPS
    # support is weak, so Apple Silicon falls back CUDA->CPU on the auto path;
    # force MMDET3D_DEVICE=mps only if you know your build works. See
    # app/engine/device.py.
    mmdet3d_device: str = "auto"
    # Override the resolved MMDetection3D config + checkpoint. Empty defaults
    # keep the API bootable without the heavy engine installed; the model alias
    # resolves to a config/checkpoint at run time. See
    # docs/features/mmdet3d-engine.md for the model zoo.
    mmdet3d_model_config: str = ""
    mmdet3d_model_checkpoint: str = ""
    # Default detection score threshold (0..1) and train/val split (0..1).
    mmdet3d_score_threshold: float = 0.3
    mmdet3d_val_split: float = 0.2
    # Sensor id + date the seed script writes its demo frames under, and the
    # create-run form prefills. See services/api/scripts/seed_lidar.py.
    mmdet3d_demo_sensor: str = "demo-sensor"
    mmdet3d_demo_date: str = "2024-01-01"

    api_port: int = 8000
    # Interactive API docs (/docs, /redoc, /openapi.json). On by default for
    # local dev and starter-kit exploration; set false to hide the full API
    # surface in production.
    enable_docs: bool = True
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    # TTL for the presigned PUT the browser uploads directly to B2 with. Long
    # enough for a big file on a slow link, short enough that a leaked URL is a
    # narrow, single-key, single-size window.
    presign_upload_expiry_seconds: int = 900  # 15 minutes

    # Optional confinement for key-addressed reads/deletes. Empty by default so
    # the by-key routes accept any key shape (they deliberately support nested
    # folders and reserved-word segments). Point a fork at a bucket shared with
    # other data? Set to e.g. "uploads/" to restrict all key ops to app uploads.
    allowed_key_prefix: str = ""

    # Full-bucket listing cache (repo/list_cache.py). Both /files and
    # /files/stats need every object, and paginating a 16k-object bucket takes
    # ~8-20s, so one scan is shared. Entries older than the TTL are still
    # served *immediately* while a background thread refreshes them
    # (stale-while-revalidate), so only the very first scan can make a user
    # wait. Uploads and deletes invalidate the cache outright, so the app's own
    # writes are never served stale — only bucket changes made elsewhere can lag
    # by up to this TTL.
    list_cache_ttl_seconds: float = 300.0
    # Scan the bucket once at startup so the first page view doesn't pay for the
    # cold scan. Set false for offline dev or when startup must not touch B2.
    warm_list_cache_on_startup: bool = True

    # Rate limiting (per client IP, per 60s window). In-process per replica —
    # documented in docs/RELIABILITY.md; horizontal scaling needs a shared
    # store (e.g. Redis). Writes/downloads get the tighter cap.
    rate_limit_per_minute: int = 120
    # Covers uploads, deletes, downloads and previews — kept generous enough
    # that a normal browsing/upload session doesn't trip it.
    rate_limit_write_per_minute: int = 60

    # Small durable counters (downloads, etc). Relative paths resolve against
    # the repo root (see repo/counter.py). Point at a persistent volume in
    # production if you care about surviving restarts.
    #
    # It must stay OUTSIDE services/api/: that is the directory `uvicorn
    # --reload` watches in dev, so a counter file there means every download
    # writes into the reloader's watch tree. Today uvicorn only restarts for
    # `*.py`, so the writes surface as misleading "N changes detected" log noise
    # on every download — but a single added `--reload-include` would turn a
    # normal user action into an API restart that drops in-flight requests.
    download_count_file: str = ".data/download_count.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def b2_endpoint(self) -> str:
        """S3-compatible endpoint derived from the region.

        Backblaze B2's S3 endpoint is always `https://s3.{region}.backblazeb2.com`,
        so the region is the single source of truth — no endpoint URL (and no
        hardcoded region string) is stored anywhere in source.
        """
        return f"https://s3.{self.b2_region}.backblazeb2.com"

    @property
    def sample_prefix(self) -> str:
        """Normalized sample prefix, always trailing-slash terminated."""
        p = self.mmdet3d_prefix
        return p if p.endswith("/") else f"{p}/"

    @property
    def cors_origins(self) -> list[str]:
        # Drop empties so a trailing comma or API_CORS_ORIGINS="" doesn't yield
        # a stray "" origin.
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()
