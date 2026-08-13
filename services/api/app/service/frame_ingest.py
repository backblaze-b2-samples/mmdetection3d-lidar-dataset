"""Ingest a raw LiDAR frame into the sensor-log layout.

The generic uploader (`service.upload`) lands files in a flat `uploads/` prefix
that the detection flow never reads, and its allow-list rejects raw binary point
clouds. This module is the frame-aware path: it presigns + verifies a
direct-to-B2 PUT that writes under
``<PREFIX>raw/<sensor_id>/<date>/<frame>.bin`` — the exact layout
`repo.runs.list_frames` reads — so an ingested sensor log becomes selectable in
the create-run form. boto3 stays in `repo/`; this only orchestrates.
"""

from __future__ import annotations

import re

from app.config import settings
from app.repo import (
    delete_file,
    generate_presigned_upload,
    get_file_metadata,
    invalidate_listing,
)
from app.repo import runs as runs_repo
from app.service.upload import UploadError, sanitize_filename
from app.types import FileUploadResponse, PresignUploadResponse
from app.types.formatting import humanize_bytes

# Raw LiDAR frames are opaque binaries; B2 stores them as octet-stream.
FRAME_CONTENT_TYPE = "application/octet-stream"
_FRAME_EXTS = {"bin", "pcd"}
_SENSOR_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_sensor_date(sensor_id: str, date: str) -> None:
    if not _SENSOR_RE.match(sensor_id or ""):
        raise UploadError(
            "Sensor id must be 1-64 chars of letters, digits, dot, dash or underscore",
            status_code=422,
        )
    if not _DATE_RE.match(date or ""):
        raise UploadError("Acquisition date must be YYYY-MM-DD", status_code=422)


def _frame_key(sensor_id: str, date: str, filename: str) -> str:
    safe = sanitize_filename(filename)
    ext = safe.rsplit(".", 1)[-1].lower() if "." in safe else ""
    if ext not in _FRAME_EXTS:
        raise UploadError("Frames must be KITTI .bin or .pcd point clouds", status_code=415)
    return f"{runs_repo.sensor_prefix(sensor_id)}{date}/{safe}"


def create_frame_presign(
    sensor_id: str, date: str, filename: str, content_type: str, size_bytes: int
) -> PresignUploadResponse:
    """Validate a declared frame upload and sign a direct-to-B2 PUT for it."""
    _validate_sensor_date(sensor_id, date)
    if size_bytes <= 0:
        raise UploadError("Empty file")
    if size_bytes > settings.max_file_size:
        raise UploadError(
            f"File too large. Max size: {humanize_bytes(settings.max_file_size)}",
            status_code=413,
        )
    key = _frame_key(sensor_id, date, filename)
    expires_in = settings.presign_upload_expiry_seconds
    url = generate_presigned_upload(key, FRAME_CONTENT_TYPE, size_bytes, expires_in)
    return PresignUploadResponse(
        key=key,
        url=url,
        method="PUT",
        content_type=FRAME_CONTENT_TYPE,
        headers={"Content-Type": FRAME_CONTENT_TYPE},
        expires_in=expires_in,
    )


def verify_frame(key: str) -> FileUploadResponse:
    """Inspect a frame just PUT directly to B2; delete + reject anything invalid."""
    prefix = runs_repo.raw_prefix()
    if not key.startswith(prefix):
        raise UploadError("Frame key must be under the raw/ sensor-log layout", status_code=422)
    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    if ext not in _FRAME_EXTS:
        raise UploadError("Frame must be a .bin/.pcd object", status_code=415)

    metadata = get_file_metadata(key)  # HEAD
    if not metadata:
        raise UploadError("Uploaded frame not found", status_code=404)

    if metadata.size_bytes == 0:
        delete_file(key)
        raise UploadError("Empty file", status_code=400)
    if metadata.size_bytes > settings.max_file_size:
        delete_file(key)
        raise UploadError(
            f"File too large. Max size: {humanize_bytes(settings.max_file_size)}",
            status_code=413,
        )
    # A KITTI .bin is a flat float32 buffer (4 bytes/value); a byte length not
    # divisible by 4 is definitively not a valid frame.
    if ext == "bin" and metadata.size_bytes % 4 != 0:
        delete_file(key)
        raise UploadError("File is not a valid KITTI float32 .bin frame", status_code=415)

    invalidate_listing()
    return FileUploadResponse(
        key=key,
        filename=metadata.filename,
        size_bytes=metadata.size_bytes,
        size_human=metadata.size_human,
        content_type=metadata.content_type,
        uploaded_at=metadata.uploaded_at,
        url=metadata.url,
        metadata=None,
    )
