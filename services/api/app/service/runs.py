"""Detection Run orchestration: create, read, edit, delete, and execute.

Ties the B2 persistence (`repo.runs`) to the local MMDetection3D engine
(`engine.mmdet3d_runner`) and the per-frame pipeline (`service.lidar_dataset`).
Run records are B2 JSON manifests — there is no database. `execute_run` is the
only path that touches the heavy engine, and it fails loudly (never fake-green)
when the engine is absent.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.config import settings
from app.engine import engine_available, resolve_device
from app.engine import engine_status as engine_status_impl
from app.engine.mmdet3d_runner import EngineUnavailableError
from app.repo import runs as repo
from app.service import lidar_dataset
from app.types.runs import (
    CreateRunRequest,
    EngineStatus,
    FrameAnnotation,
    RunRecord,
    RunSummary,
    SensorLogInfo,
    UpdateRunRequest,
)

# Friendly model alias -> MMDetection3D model name the inferencer resolves to a
# config + checkpoint via its metafile. MMDET3D_MODEL_CONFIG overrides this for
# every model. See docs/features/mmdet3d-engine.md for the model zoo, and the
# spconv/CUDA notes for SECOND/CenterPoint.
DET_MODELS = {
    "pointpillars": "pointpillars_hv_secfpn_8xb6-160e_kitti-3d-3class",
    "second": "second_hv_secfpn_8xb6-80e_kitti-3d-3class",
    "centerpoint": "centerpoint_voxel0075_second_secfpn_head-circlenms_8xb4-cyclic-20e_nus-3d",
}
# Segmentation uses a dedicated point-segmentation model regardless of the
# detection-model Select (the two model families are disjoint in MMDetection3D).
SEG_MODEL = "minkunet_w32_8xb2-15e_semantickitti"


class RunNotFoundError(Exception):
    pass


class FramesNotFoundError(Exception):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _resolve_model_name(task: str, model: str) -> str:
    if settings.mmdet3d_model_config:
        return settings.mmdet3d_model_config
    if task == "segmentation":
        return SEG_MODEL
    return DET_MODELS.get(model, DET_MODELS["pointpillars"])


def engine_status() -> EngineStatus:
    return EngineStatus(**engine_status_impl(settings.mmdet3d_device))


def list_sensor_logs() -> list[SensorLogInfo]:
    return [SensorLogInfo(**s) for s in repo.sensor_log_summaries()]


def list_dates(sensor_id: str) -> list[str]:
    return repo.list_dates(sensor_id)


def list_runs() -> list[RunRecord]:
    return [RunRecord(**m) for m in repo.list_manifests()]


def get_run(run_id: str) -> RunRecord:
    manifest = repo.read_manifest(run_id)
    if not manifest:
        raise RunNotFoundError(run_id)
    return RunRecord(**manifest)


def create_run(req: CreateRunRequest) -> RunRecord:
    run_id = uuid.uuid4().hex[:12]
    now = _now()
    record = RunRecord(
        run_id=run_id,
        label=req.label,
        sensor_id=req.sensor_id,
        model=req.model,
        task=req.task,
        score_threshold=req.score_threshold,
        val_split=req.val_split,
        device=req.device,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    repo.write_manifest(run_id, record.model_dump(mode="json"))
    return record


def update_run(run_id: str, req: UpdateRunRequest) -> RunRecord:
    manifest = repo.read_manifest(run_id)
    if not manifest:
        raise RunNotFoundError(run_id)
    for field in ("label", "model", "task", "score_threshold", "val_split", "device"):
        value = getattr(req, field)
        if value is not None:
            manifest[field] = value
    manifest["updated_at"] = _now()
    record = RunRecord(**manifest)
    repo.write_manifest(run_id, record.model_dump(mode="json"))
    return record


def delete_run(run_id: str) -> int:
    if not repo.read_manifest(run_id):
        raise RunNotFoundError(run_id)
    return repo.delete_run(run_id)


def _split_for(index: int, val_split: float) -> str:
    """Deterministic, spread train/val assignment (~val_split fraction to val)."""
    if val_split <= 0:
        return "train"
    denom = max(1, round(1.0 / val_split))
    return "val" if index % denom == 0 else "train"


def execute_run(run_id: str) -> RunRecord:
    manifest = repo.read_manifest(run_id)
    if not manifest:
        raise RunNotFoundError(run_id)

    device = resolve_device(manifest.get("device", settings.mmdet3d_device))
    if not engine_available():
        manifest.update(
            status="error", resolved_device=device, updated_at=_now(),
            error="MMDetection3D engine not installed. Run `pnpm run setup:mmdet3d-engine`.",
        )
        repo.write_manifest(run_id, RunRecord(**manifest).model_dump(mode="json"))
        raise EngineUnavailableError(manifest["error"])

    frames_keys = repo.list_frames(manifest["sensor_id"])
    if not frames_keys:
        manifest.update(
            status="error", updated_at=_now(),
            error=f"No LiDAR frames found under raw/{manifest['sensor_id']}/.",
        )
        repo.write_manifest(run_id, RunRecord(**manifest).model_dump(mode="json"))
        raise FramesNotFoundError(manifest["error"])

    manifest.update(status="running", resolved_device=device, updated_at=_now(), error=None)
    repo.write_manifest(run_id, RunRecord(**manifest).model_dump(mode="json"))

    task = manifest["task"]
    model = manifest["model"]
    model_name = _resolve_model_name(task, model)
    checkpoint = settings.mmdet3d_model_checkpoint
    threshold = float(manifest.get("score_threshold", 0.3))
    val_split = float(manifest.get("val_split", 0.2))

    frames: list[FrameAnnotation] = []
    derived_total = source_total = 0
    for i, raw_key in enumerate(frames_keys):
        frame, derived, source = lidar_dataset.process_frame(
            run_id, raw_key,
            task=task, device=device, model=model_name, checkpoint=checkpoint,
            score_threshold=threshold, split=_split_for(i, val_split),
        )
        frames.append(frame)
        derived_total += derived
        source_total += source

    manifest_key, m_bytes = lidar_dataset.write_dataset_manifest(run_id, frames)
    checkpoint_key, c_bytes = lidar_dataset.archive_checkpoint(
        run_id, model, model_name, checkpoint
    )
    derived_total += m_bytes + c_bytes

    summary = _aggregate(frames)
    manifest.update(
        status="done", updated_at=_now(), resolved_device=device, error=None,
        frames=[f.model_dump(mode="json") for f in frames],
        source_bytes=source_total, derived_bytes=derived_total,
        manifest_key=manifest_key, checkpoint_key=checkpoint_key,
        summary=summary.model_dump(mode="json"),
    )
    record = RunRecord(**manifest)
    repo.write_manifest(run_id, record.model_dump(mode="json"))
    return record


def _aggregate(frames: list[FrameAnnotation]) -> RunSummary:
    per_class: dict[str, int] = {}
    for f in frames:
        for label, count in f.label_histogram.items():
            per_class[label] = per_class.get(label, 0) + count
    return RunSummary(
        frame_count=len(frames),
        total_boxes=sum(f.num_boxes for f in frames),
        train_frames=sum(1 for f in frames if f.split == "train"),
        val_frames=sum(1 for f in frames if f.split == "val"),
        per_class=per_class,
    )
