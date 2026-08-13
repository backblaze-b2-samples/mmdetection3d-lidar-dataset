import logging

# Sync `def` handlers on purpose (same rationale as runtime/files.py): the whole
# call chain is blocking boto3 + local engine work, and Starlette runs sync
# handlers in its threadpool, so a long inference never stalls the event loop.
from fastapi import APIRouter, HTTPException

from app.engine.mmdet3d_runner import EngineUnavailableError
from app.service.runs import (
    FramesNotFoundError,
    RunNotFoundError,
    create_run,
    delete_run,
    engine_status,
    execute_run,
    get_run,
    list_dates,
    list_runs,
    list_sensor_logs,
    update_run,
)
from app.types.runs import (
    CreateRunRequest,
    EngineStatus,
    RunRecord,
    SensorLogInfo,
    UpdateRunRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like the files routes, these are intentionally UNAUTHENTICATED and
# bucket-wide (single-tenant demo stance — see docs/SECURITY.md). Delete is
# strictly prefix-scoped to one run (repo.delete_run) so it can never wipe raw
# source frames or another run.


@router.get("/engine/status", response_model=EngineStatus)
def engine_status_endpoint():
    """Whether the MMDetection3D stack is importable + which device is active."""
    return engine_status()


@router.get("/sensor-logs", response_model=list[SensorLogInfo])
def list_sensor_logs_endpoint():
    """Sensor logs (with their dates + frame counts) that have ingested frames."""
    return list_sensor_logs()


@router.get("/sensor-logs/{sensor_id}/dates", response_model=list[str])
def list_dates_endpoint(sensor_id: str):
    """Acquisition dates that actually have frames under a sensor id."""
    return list_dates(sensor_id)


@router.get("/runs", response_model=list[RunRecord])
def list_runs_endpoint():
    return list_runs()


@router.post("/runs", response_model=RunRecord)
def create_run_endpoint(req: CreateRunRequest):
    record = create_run(req)
    logger.info(
        "Run created: id=%s sensor=%s model=%s task=%s",
        record.run_id, record.sensor_id, record.model, record.task,
    )
    return record


@router.get("/runs/{run_id}", response_model=RunRecord)
def get_run_endpoint(run_id: str):
    try:
        return get_run(run_id)
    except RunNotFoundError:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found") from None


@router.patch("/runs/{run_id}", response_model=RunRecord)
def update_run_endpoint(run_id: str, req: UpdateRunRequest):
    try:
        return update_run(run_id, req)
    except RunNotFoundError:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found") from None


@router.delete("/runs/{run_id}")
def delete_run_endpoint(run_id: str):
    try:
        deleted = delete_run(run_id)
    except RunNotFoundError:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found") from None
    logger.info("Run deleted: id=%s objects=%d", run_id, deleted)
    return {"deleted": True, "run_id": run_id, "objects": deleted}


@router.post("/runs/{run_id}/execute", response_model=RunRecord)
def execute_run_endpoint(run_id: str):
    """Run (or re-run) MMDetection3D over a sensor log and write its artifacts."""
    try:
        return execute_run(run_id)
    except RunNotFoundError:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found") from None
    except EngineUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from None
    except FramesNotFoundError as e:
        raise HTTPException(status_code=422, detail=str(e)) from None
