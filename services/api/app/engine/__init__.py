"""Local MMDetection3D LiDAR engine.

Every heavy dependency (torch, mmcv, mmengine, mmdet, mmdet3d) is imported
*lazily inside function bodies*, never at module import time, so the FastAPI app
boots and the test suite passes with only the base requirements installed. Only
`point_cloud.py` uses numpy at import time — numpy ships in the BASE
requirements so the base app can parse `.bin` frames and compute previews
without the engine. Install the heavy engine with `pnpm run setup:mmdet3d-engine`
(services/api/requirements-engine.txt) before running a real detection.
"""

from app.engine.device import DEVICE_CHOICES, resolve_device
from app.engine.engine_status import engine_available, engine_status

__all__ = [
    "DEVICE_CHOICES",
    "engine_available",
    "engine_status",
    "resolve_device",
]
