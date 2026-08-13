#!/bin/sh
# Opt-in installer for the heavy MMDetection3D LiDAR engine.
#
# Installs services/api/requirements-engine.txt into the SAME venv the base app
# uses (services/api/.venv). Kept OUT of `pnpm run setup` because the OpenMMLab
# 3D stack (esp. mmcv, which builds from source on macOS arm64) is slow and
# fragile. The app + `pnpm verify` run green WITHOUT this — every engine import
# is lazy.
#
# Run once, after `pnpm run setup`:
#     pnpm run setup:mmdet3d-engine
set -e

HERE="$(dirname "$0")"
API_DIR="$(cd "$HERE/../services/api" && pwd)"
VENV_PIP="$API_DIR/.venv/bin/pip"
VENV_MIM="$API_DIR/.venv/bin/mim"

if [ ! -x "$VENV_PIP" ]; then
  echo "Backend venv missing at $API_DIR/.venv — run 'pnpm run setup' first." >&2
  exit 1
fi

echo "Installing MMDetection3D engine into $API_DIR/.venv ..."
echo "This is heavy (torch + mmcv build). Expect several minutes on first run."

# 1) torch/torchvision + openmim first, so mim is available to resolve mmcv.
"$VENV_PIP" install --upgrade pip
"$VENV_PIP" install "numpy<2" "openmim>=0.3.9" \
  "torch>=2.1.0,<2.4.0" "torchvision>=0.16.0,<0.19.0"

# 2) Repair the build toolchain BEFORE calling mim. openmim drags in openxlab,
#    which pins setuptools==60.2.0 — and that ancient setuptools' pkg_resources
#    calls pkgutil.ImpImporter, REMOVED in Python 3.12, so `mim` can't even
#    import. Restore a 3.12-safe setuptools (>=70 so pkg_resources works; <81
#    because 81 drops the pkg_resources/distutils shims mmcv's source build still
#    needs) plus the wheel+ninja build tools mmcv compiles its CPU ops with.
"$VENV_PIP" install --upgrade "setuptools>=70,<81" wheel ninja

# 3) mmcv (+ mmengine) via mim. No prebuilt macOS arm64 wheel exists, so mmcv
#    builds from source against the installed torch. Two flags make that build
#    work on Python 3.12 + a current Apple clang/libc++:
#      --no-build-isolation  -> build against the venv's 3.12-safe setuptools+torch.
#      CPPFLAGS=-Wno-invalid-specialization -> torch<2.4's bundled
#                               c10/util/strong_type.h specializes std::is_arithmetic,
#                               which the current macOS libc++ SDK forbids; the flag
#                               downgrades that hard compile error. GCC ignores it.
#    numpy<2 is repeated so the resolver keeps mmcv's required numpy 1.x.
CPPFLAGS="${CPPFLAGS:+$CPPFLAGS }-Wno-invalid-specialization" \
  "$VENV_MIM" install --no-build-isolation \
  "numpy<2" "mmengine>=0.10.3" "mmcv>=2.1.0,<2.2.0"

# 4) the rest of the OpenMMLab stack + the vendor engine (mmdet + mmdet3d).
"$VENV_PIP" install -r "$API_DIR/requirements-engine.txt"

# 5) Final setuptools repair: step 4 can re-install the openxlab pin, dragging
#    setuptools back to the 3.12-broken 60.2.0, so restore it one last time.
#    openxlab is unused at runtime, so its leftover resolver warning is cosmetic.
"$VENV_PIP" install --upgrade "setuptools>=70,<81"

echo ""
echo "Done. Verify with:"
echo "  services/api/.venv/bin/python -c 'import mmdet3d, mmdet, mmcv, torch; print(\"engine OK\")'"
echo "Then seed demo frames and run detection — see docs/features/mmdet3d-engine.md."
