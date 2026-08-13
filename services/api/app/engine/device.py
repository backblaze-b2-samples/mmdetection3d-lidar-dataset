"""Runtime device selection for the local MMDetection3D engine.

Policy (matches the parent `deployment: local` rule): default to CPU and never
hard-require a GPU. `resolve_device("auto")` picks the first available of
CUDA -> CPU. Apple MPS is intentionally *skipped* on the auto path: mmcv/mmdet3d
MPS support is weak/incomplete for the OpenMMLab 3D-detection stack (and the
sparse-conv ops used by SECOND/CenterPoint have no MPS kernels), so an
Apple-Silicon machine falls back CUDA -> CPU. A user who knows their build works
can still force `MMDET3D_DEVICE=mps` explicitly and we honour it.
"""

from __future__ import annotations

DEVICE_CHOICES = ("auto", "cpu", "cuda", "mps")


def _torch():
    """Return the torch module, or None when the engine isn't installed."""
    try:
        import torch  # local import keeps torch optional at app boot

        return torch
    except Exception:
        return None


def _cuda_available(torch) -> bool:
    try:
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _mps_available(torch) -> bool:
    try:
        return bool(torch.backends.mps.is_available())
    except Exception:
        return False


def resolve_device(preference: str = "auto") -> str:
    """Resolve a concrete device string ("cuda" | "mps" | "cpu").

    Without torch installed we can only ever run on CPU, so every preference
    collapses to "cpu". With torch:
      - "cpu"  -> cpu
      - "cuda" -> cuda if available else cpu
      - "mps"  -> mps if available else cpu (explicit opt-in only)
      - "auto" -> cuda if available else cpu (MPS deliberately skipped; see module docstring)
    """
    pref = (preference or "auto").strip().lower()
    torch = _torch()
    if torch is None:
        return "cpu"

    if pref == "cpu":
        return "cpu"
    if pref == "cuda":
        return "cuda" if _cuda_available(torch) else "cpu"
    if pref == "mps":
        return "mps" if _mps_available(torch) else "cpu"

    # auto
    if _cuda_available(torch):
        return "cuda"
    return "cpu"
