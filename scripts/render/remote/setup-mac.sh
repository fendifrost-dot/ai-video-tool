#!/bin/bash
# Partnership render dependencies for an Apple Silicon Mac Studio.
# Installs Homebrew packages and a venv. Does not download the 23 GB lock,
# does not start a render, and does not call a cloud API.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "setup-mac.sh is for macOS on Apple Silicon (arm64). This machine is $(uname -s) $(uname -m)." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Install Homebrew from https://brew.sh and run this script again." >&2
  exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
brew install python@3.12 ffmpeg

sudo mkdir -p /workspace/partnership/second_half
sudo chown -R "$(id -u)":"$(id -g)" /workspace

VENV="${HOME}/.cache/avt/venv_comp"
mkdir -p "$(dirname "$VENV")"
"$(brew --prefix python@3.12)/bin/python3.12" -m venv "$VENV"
# The lock recorded numpy 2.5.5, cv2 5.1.0, scipy 1.18.1 on Linux.
# opencv is left unpinned: the ARM wheel may not be that exact build.
# The parity test, not the version pin, decides whether the pictures match.
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install 'numpy==2.5.5' 'scipy==1.18.1' 'opencv-python-headless'
"$VENV/bin/python" - <<'PY'
import numpy, cv2, scipy
print("numpy", numpy.__version__)
print("cv2", cv2.__version__)
print("scipy", scipy.__version__)
PY
echo "ffmpeg: $(ffmpeg -version | head -n 1)"
echo "Work tree: /workspace/partnership/second_half"
echo "Next: python3 scripts/render/remote/remote_render.py --backend mac --ram-gb 32 --dry-run"
