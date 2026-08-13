from datetime import datetime

from pydantic import BaseModel

from app.types.files import FileMetadataDetail


class FileUploadResponse(BaseModel):
    key: str
    filename: str
    size_bytes: int
    size_human: str
    content_type: str
    uploaded_at: datetime
    url: str | None = None
    metadata: FileMetadataDetail | None = None


class PresignUploadRequest(BaseModel):
    """What the browser declares before uploading directly to B2."""

    filename: str
    content_type: str
    size_bytes: int


class PresignUploadResponse(BaseModel):
    """A short-lived presigned PUT the browser uploads to, plus the exact
    headers it must send. `Content-Length` and `content-type` are signed into
    the URL, so B2 rejects a body of any other size or type.
    """

    key: str
    url: str
    method: str
    content_type: str
    headers: dict[str, str]
    expires_in: int


class VerifyUploadRequest(BaseModel):
    """Sent after the direct PUT so the API can inspect the stored object."""

    key: str


class FramePresignRequest(BaseModel):
    """Declare a raw LiDAR frame upload targeting the sensor-log layout.

    Unlike the generic uploader (flat ``uploads/``), a frame lands under
    ``raw/<sensor_id>/<date>/`` so it becomes selectable as a sensor log in the
    create-run form and feeds the detection pipeline.
    """

    sensor_id: str
    date: str
    filename: str
    content_type: str
    size_bytes: int
