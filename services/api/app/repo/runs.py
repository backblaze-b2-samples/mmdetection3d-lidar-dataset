"""B2 persistence for Detection Runs + raw-frame discovery.

Run manifests and their artifacts live entirely in B2 (no database):

    <PREFIX>runs/<run_id>/run.json                 manifest
    <PREFIX>preprocessed/<run_id>/<frame>.npz       preprocessed tensors
    <PREFIX>annotations/<run_id>/<frame>.json       per-frame 3D annotations
    <PREFIX>datasets/<run_id>/manifest.jsonl        dataset manifest (frame->split)
    <PREFIX>checkpoints/<model>/<checkpoint>.pth     archived model checkpoints
    <PREFIX>raw/<sensor_id>/<date>/<frame>.bin       raw ingested LiDAR frames

boto3 stays confined to this repo layer (via the shared client in b2_client).
"""

from __future__ import annotations

import json

from botocore.exceptions import ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as invalidate_listing


def _prefix() -> str:
    return settings.sample_prefix


def runs_prefix() -> str:
    return f"{_prefix()}runs/"


def run_prefix(run_id: str) -> str:
    return f"{runs_prefix()}{run_id}/"


def manifest_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}run.json"


def annotations_prefix(run_id: str) -> str:
    return f"{_prefix()}annotations/{run_id}/"


def preprocessed_prefix(run_id: str) -> str:
    return f"{_prefix()}preprocessed/{run_id}/"


def datasets_prefix(run_id: str) -> str:
    return f"{_prefix()}datasets/{run_id}/"


def dataset_manifest_key(run_id: str) -> str:
    return f"{datasets_prefix(run_id)}manifest.jsonl"


def checkpoints_prefix(model: str) -> str:
    return f"{_prefix()}checkpoints/{model}/"


def raw_prefix() -> str:
    return f"{_prefix()}raw/"


def sensor_prefix(sensor_id: str) -> str:
    return f"{raw_prefix()}{sensor_id}/"


def _list_keys(prefix: str, *, delimiter: str | None = None) -> tuple[list[dict], list[str]]:
    """Paginate list_objects_v2 under `prefix`. Returns (contents, common_prefixes)."""
    client = get_s3_client()
    contents: list[dict] = []
    common: list[str] = []
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": 1000}
    if delimiter:
        kwargs["Delimiter"] = delimiter
    try:
        while True:
            resp = client.list_objects_v2(**kwargs)
            contents.extend(resp.get("Contents", []))
            common.extend(cp["Prefix"] for cp in resp.get("CommonPrefixes", []))
            if not resp.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
    except ClientError as e:
        raise RuntimeError(f"B2 list failed for '{prefix}': {e}") from e
    return contents, common


# --- run manifests --------------------------------------------------------


def read_manifest(run_id: str) -> dict | None:
    client = get_s3_client()
    try:
        resp = client.get_object(Bucket=settings.b2_bucket_name, Key=manifest_key(run_id))
        return json.loads(resp["Body"].read())
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 get manifest failed for '{run_id}': {e}") from e


def list_manifests() -> list[dict]:
    """Every run manifest, newest-first. One get_object per run.json key."""
    contents, _ = _list_keys(runs_prefix())
    manifests: list[dict] = []
    for obj in contents:
        if obj["Key"].endswith("/run.json"):
            run_id = obj["Key"][len(runs_prefix()) :].split("/", 1)[0]
            manifest = read_manifest(run_id)
            if manifest:
                manifests.append(manifest)
    manifests.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return manifests


def write_manifest(run_id: str, data: dict) -> None:
    put_artifact(manifest_key(run_id), json.dumps(data, indent=2).encode("utf-8"),
                 "application/json")


def put_artifact(key: str, data: bytes, content_type: str) -> int:
    """Write one artifact object; returns the byte count written."""
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name, Key=key, Body=data, ContentType=content_type
        )
    except ClientError as e:
        raise RuntimeError(f"B2 put artifact failed for '{key}': {e}") from e
    invalidate_listing()
    return len(data)


def get_object_bytes(key: str) -> bytes:
    client = get_s3_client()
    try:
        resp = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return resp["Body"].read()
    except ClientError as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e


def delete_run(run_id: str) -> int:
    """Delete every object derived from this run ONLY. Returns count deleted.

    Strictly scoped to the run's own prefixes (`runs/<id>/`, `annotations/<id>/`,
    `preprocessed/<id>/`, `datasets/<id>/`): it can never touch raw source frames
    or any other run (parent safety rule — prefix-scoped deletes only). Archived
    checkpoints under `checkpoints/<model>/` are shared and intentionally kept.
    """
    client = get_s3_client()
    deleted = 0
    for prefix in (
        run_prefix(run_id),
        annotations_prefix(run_id),
        preprocessed_prefix(run_id),
        datasets_prefix(run_id),
    ):
        contents, _ = _list_keys(prefix)
        for obj in contents:
            try:
                client.delete_object(Bucket=settings.b2_bucket_name, Key=obj["Key"])
                deleted += 1
            except ClientError as e:
                raise RuntimeError(f"B2 delete failed for '{obj['Key']}': {e}") from e
    invalidate_listing()
    return deleted


# --- raw-frame discovery (for the create-run form selector) ---------------

_FRAME_EXTS = (".bin", ".pcd")


def list_sensor_ids() -> list[str]:
    """Sensor ids that have a raw/ tree under <PREFIX>raw/."""
    _, common = _list_keys(raw_prefix(), delimiter="/")
    ids = [cp[len(raw_prefix()) :].rstrip("/") for cp in common]
    return sorted(s for s in ids if s)


def list_dates(sensor_id: str) -> list[str]:
    """Acquisition dates that actually have frames under a sensor id."""
    base = sensor_prefix(sensor_id)
    _, common = _list_keys(base, delimiter="/")
    dates = [cp[len(base) :].rstrip("/") for cp in common]
    return sorted(d for d in dates if d)


def list_frames(sensor_id: str) -> list[str]:
    """Object keys of every raw frame under a sensor id (all dates)."""
    contents, _ = _list_keys(sensor_prefix(sensor_id))
    return sorted(
        obj["Key"] for obj in contents if obj["Key"].lower().endswith(_FRAME_EXTS)
    )


def sensor_log_summaries() -> list[dict]:
    """Sensor id + its dates + frame count, for the dashboard and form."""
    summaries = []
    for sensor_id in list_sensor_ids():
        dates = list_dates(sensor_id)
        frame_count = len(list_frames(sensor_id))
        summaries.append({"sensor_id": sensor_id, "dates": dates, "frame_count": frame_count})
    return summaries
