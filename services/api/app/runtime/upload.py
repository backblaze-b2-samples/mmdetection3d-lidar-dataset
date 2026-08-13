import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.runtime.metrics import record_upload
from app.service.frame_ingest import create_frame_presign, verify_frame
from app.service.upload import UploadError, create_presigned_upload, verify_upload
from app.types import (
    FileUploadResponse,
    FramePresignRequest,
    PresignUploadRequest,
    PresignUploadResponse,
    VerifyUploadRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload/presign", response_model=PresignUploadResponse)
async def presign_upload(req: PresignUploadRequest):
    """Validate a declared upload and hand back a presigned PUT.

    The browser uploads the bytes straight to B2 with the returned URL, so they
    never traverse this Function — that is what lifts Vercel's ~4.5 MB payload
    ceiling. Size and content-type are signed into the URL (see the service).
    """
    try:
        # generate_presigned_url does blocking (botocore) work; keep it off the
        # event loop.
        return await run_in_threadpool(
            create_presigned_upload,
            filename=req.filename,
            content_type=req.content_type,
            size_bytes=req.size_bytes,
        )
    except UploadError as e:
        logger.warning("Presign rejected: %s", e.detail)
        record_upload(success=False)
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.post("/upload/verify", response_model=FileUploadResponse)
async def verify_upload_route(req: VerifyUploadRequest):
    """Confirm an object just uploaded directly to B2 is valid and visible."""
    try:
        result = await run_in_threadpool(verify_upload, req.key)
    except UploadError as e:
        logger.warning("Upload verification rejected: %s", e.detail)
        record_upload(success=False)
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None

    record_upload(success=True)
    logger.info(
        "File uploaded (direct): key=%s size=%d type=%s",
        result.key,
        result.size_bytes,
        result.content_type,
    )
    return result


@router.post("/frames/presign", response_model=PresignUploadResponse)
async def presign_frame(req: FramePresignRequest):
    """Presign a direct-to-B2 PUT for a raw LiDAR frame in the sensor-log layout.

    Writes under ``raw/<sensor_id>/<date>/`` so the frame feeds the detection
    flow and the sensor log becomes selectable in the create-run form — unlike
    the generic uploader's flat ``uploads/`` prefix.
    """
    try:
        return await run_in_threadpool(
            create_frame_presign,
            sensor_id=req.sensor_id,
            date=req.date,
            filename=req.filename,
            content_type=req.content_type,
            size_bytes=req.size_bytes,
        )
    except UploadError as e:
        logger.warning("Frame presign rejected: %s", e.detail)
        record_upload(success=False)
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.post("/frames/verify", response_model=FileUploadResponse)
async def verify_frame_route(req: VerifyUploadRequest):
    """Confirm a LiDAR frame just uploaded directly to B2 is valid."""
    try:
        result = await run_in_threadpool(verify_frame, req.key)
    except UploadError as e:
        logger.warning("Frame verification rejected: %s", e.detail)
        record_upload(success=False)
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None

    record_upload(success=True)
    logger.info("Frame ingested (direct): key=%s size=%d", result.key, result.size_bytes)
    return result
