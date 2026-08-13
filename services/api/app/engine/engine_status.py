"""Report whether the MMDetection3D engine is importable and which device is active.

Surfaced by `GET /engine/status` and the UI engine-status badge. Kept cheap and
side-effect free: it does NOT run inference. `engine_available()` attempts the
lazy imports and returns a bool instead of raising, so a missing engine renders a
clear "unavailable" badge rather than a 500.
"""

from __future__ import annotations

from app.engine.device import resolve_device


def _torch_installed() -> bool:
    try:
        import torch  # noqa: F401

        return True
    except Exception:
        return False


def engine_available() -> bool:
    """True only if the full MMDetection3D stack imports cleanly."""
    try:
        import mmcv  # noqa: F401
        import mmdet  # noqa: F401
        import mmdet3d  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return False


def engine_status(device_preference: str = "auto") -> dict:
    """Structured status for the API + UI badge."""
    torch_ok = _torch_installed()
    available = engine_available()
    device = resolve_device(device_preference) if torch_ok else "cpu"
    if available:
        detail = f"MMDetection3D engine ready (device: {device})."
    elif torch_ok:
        detail = (
            "torch is installed but the MMDetection3D/mmcv stack is not. "
            "Run `pnpm run setup:mmdet3d-engine`."
        )
    else:
        detail = (
            "Engine not installed. Run `pnpm run setup:mmdet3d-engine` to enable "
            "3D detection & segmentation."
        )
    return {
        "available": available,
        "device": device,
        "torch_installed": torch_ok,
        "detail": detail,
    }
