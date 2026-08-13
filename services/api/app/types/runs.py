"""Pydantic models for the Detection Run domain (the sample's primary entity).

A Detection Run is one MMDetection3D pass over a sensor log's LiDAR frames. It
is persisted as a single JSON manifest in B2 at
`<MMDET3D_PREFIX>runs/<run_id>/run.json`; there is no database. Per-frame
annotations and the dataset manifest are written as separate objects under the
same run prefix (see repo/runs.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Finite, enumerable set of shipped MMDetection3D model families. The
# create/edit forms render this as a Select (never free text). The concrete
# config + checkpoint each maps to is documented in
# docs/features/mmdet3d-engine.md and resolved at run time
# (MMDET3D_MODEL_CONFIG / MMDET3D_MODEL_CHECKPOINT override).
ModelName = Literal["pointpillars", "centerpoint", "second"]
MODEL_CHOICES: tuple[ModelName, ...] = ("pointpillars", "centerpoint", "second")

TaskName = Literal["detection", "segmentation"]
TASK_CHOICES: tuple[TaskName, ...] = ("detection", "segmentation")

DeviceChoice = Literal["auto", "cpu", "cuda", "mps"]

RunStatus = Literal["pending", "running", "done", "error"]


class FrameAnnotation(BaseModel):
    """Per-frame annotation record + the B2 keys of its artifacts."""

    frame: str
    raw_key: str
    annotation_key: str
    preview_key: str | None = None
    point_count: int = 0
    num_boxes: int = 0
    # Per-label box histogram (label id -> count), meaningful even when 0 boxes.
    label_histogram: dict[str, int] = Field(default_factory=dict)
    split: Literal["train", "val"] = "train"


class RunSummary(BaseModel):
    """Aggregate roll-up for a completed run."""

    frame_count: int = 0
    total_boxes: int = 0
    train_frames: int = 0
    val_frames: int = 0
    per_class: dict[str, int] = Field(default_factory=dict)


class RunRecord(BaseModel):
    """The full persisted manifest for a run."""

    run_id: str
    label: str
    sensor_id: str
    model: ModelName = "pointpillars"
    task: TaskName = "detection"
    score_threshold: float = 0.3
    val_split: float = 0.2
    device: DeviceChoice = "auto"
    status: RunStatus = "pending"
    created_at: datetime
    updated_at: datetime
    resolved_device: str | None = None
    error: str | None = None
    checkpoint_key: str | None = None
    manifest_key: str | None = None
    source_bytes: int = 0
    derived_bytes: int = 0
    frames: list[FrameAnnotation] = Field(default_factory=list)
    summary: RunSummary | None = None


class CreateRunRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    sensor_id: str = Field(min_length=1, max_length=120)
    model: ModelName = "pointpillars"
    task: TaskName = "detection"
    score_threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    val_split: float = Field(default=0.2, ge=0.0, le=1.0)
    device: DeviceChoice = "auto"


class UpdateRunRequest(BaseModel):
    """Edit verb: change label / model / task / threshold / val_split / device.
    The sensor log is fixed at create time — a different log is a new run."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    model: ModelName | None = None
    task: TaskName | None = None
    score_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    val_split: float | None = Field(default=None, ge=0.0, le=1.0)
    device: DeviceChoice | None = None


class SensorLogInfo(BaseModel):
    """A named collection of ingested LiDAR frames (populates the form Select)."""

    sensor_id: str
    dates: list[str] = Field(default_factory=list)
    frame_count: int = 0


class EngineStatus(BaseModel):
    """Reported to the UI engine-status badge and the run route."""

    available: bool
    device: str
    torch_installed: bool
    detail: str
