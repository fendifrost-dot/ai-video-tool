#!/bin/bash
# Install the AVT GPU worker on the owner's Mac.
# Writes only under /Volumes/T7/AVT_GPU_Worker, ~/Library/LaunchAgents, and ~/.secrets.
# Does not download model weights. Does not touch the rest of the T7 or iCloud.
set -euo pipefail

ROOT="/Volumes/T7/AVT_GPU_Worker"
COMFY_REF="v0.45.3"
COMFY_URL="https://github.com/Comfy-Org/ComfyUI.git"
PLIST_LABEL="app.avt.gpu-worker"
PLIST_DEST="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
SECRET_FILE="${HOME}/.secrets/avt_gpu_worker.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "avt-gpu: $*" >&2; exit 1; }

case "$ROOT" in
  *Mobile\ Documents*|*CloudDocs*|*com~apple~CloudDocs*) die "iCloud paths are refused" ;;
esac
[[ "$(uname -s)" == "Darwin" ]] || die "this installer is for macOS"
[[ "$(uname -m)" == "arm64" ]] || die "this installer is for Apple Silicon"
[[ -d /Volumes/T7 ]] || die "mount the Samsung T7 at /Volumes/T7 and run this again"
[[ "$ROOT" == /Volumes/T7/AVT_GPU_Worker ]] || die "refusing to install outside /Volumes/T7/AVT_GPU_Worker"

if [[ -n "${AVT_GPU_ROOT:-}" && "$AVT_GPU_ROOT" != "$ROOT" ]]; then
  die "AVT_GPU_ROOT must be ${ROOT}"
fi

PY=""
for candidate in python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    ver="$("$candidate" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
    case "$ver" in
      3.12|3.11) PY="$(command -v "$candidate")"; break ;;
    esac
  fi
done
[[ -n "$PY" ]] || die "install Python 3.12 from python.org, then run this again"
command -v node >/dev/null 2>&1 || die "install Node 22 or newer (the worker uses --experimental-strip-types)"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 22 ]] || die "Node $(node -v) is too old; install Node 22 or newer"

mkdir -p \
  "$ROOT/models/checkpoints" \
  "$ROOT/models/loras" \
  "$ROOT/models/vae" \
  "$ROOT/models/clip" \
  "$ROOT/models/controlnet" \
  "$ROOT/models/upscale_models" \
  "$ROOT/models/diffusion_models" \
  "$ROOT/cache" \
  "$ROOT/scratch" \
  "$ROOT/logs" \
  "${HOME}/.secrets" \
  "${HOME}/Library/LaunchAgents"

if [[ ! -d "$ROOT/ComfyUI/.git" ]]; then
  git clone --depth 1 --branch "$COMFY_REF" "$COMFY_URL" "$ROOT/ComfyUI"
else
  git -C "$ROOT/ComfyUI" fetch --depth 1 origin "refs/tags/${COMFY_REF}:refs/tags/${COMFY_REF}" || true
  git -C "$ROOT/ComfyUI" checkout "$COMFY_REF"
fi

if [[ ! -x "$ROOT/venv/bin/python" ]]; then
  "$PY" -m venv "$ROOT/venv"
fi
"$ROOT/venv/bin/python" -m pip install --upgrade pip
"$ROOT/venv/bin/pip" install "torch>=2.6,<2.11" torchvision torchaudio
"$ROOT/venv/bin/pip" install -r "$ROOT/ComfyUI/requirements.txt"

cat > "$ROOT/extra_model_paths.yaml" <<'YAML'
avt:
    base_path: /Volumes/T7/AVT_GPU_Worker/models
    checkpoints: checkpoints
    loras: loras
    vae: vae
    clip: clip
    controlnet: controlnet
    upscale_models: upscale_models
    diffusion_models: diffusion_models
    unet: diffusion_models
YAML

cat > "$ROOT/run-mac.sh" <<EOF
#!/bin/bash
set -euo pipefail
ROOT="$ROOT"
export PYTORCH_ENABLE_MPS_FALLBACK=1
if ! curl -sf "http://127.0.0.1:8188/system_stats" >/dev/null; then
  "\$ROOT/venv/bin/python" "\$ROOT/ComfyUI/main.py" \\
    --listen 127.0.0.1 --port 8188 \\
    --lowvram --fp32-vae --reserve-vram 2 \\
    --extra-model-paths-config "\$ROOT/extra_model_paths.yaml" \\
    >> "\$ROOT/logs/comfy.log" 2>&1 &
  echo \$! > "\$ROOT/logs/comfy.pid"
fi
set -a
# shellcheck disable=SC1090
source "${SECRET_FILE}"
set +a
exec /usr/bin/env node --experimental-strip-types "${SCRIPT_DIR}/worker.mjs"
EOF
chmod 755 "$ROOT/run-mac.sh"

if [[ ! -f "$SECRET_FILE" ]]; then
  secret="$(openssl rand -base64 32 | tr -d '\n')"
  umask 077
  cat > "$SECRET_FILE" <<EOF
AVT_WORKER_SECRET=${secret}
AVT_GPU_API=https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/gpu-worker-api
AVT_GPU_ROOT=${ROOT}
AVT_COMFY_URL=http://127.0.0.1:8188
EOF
  chmod 600 "$SECRET_FILE"
  echo "wrote ${SECRET_FILE} (mode 600). The secret is not printed."
else
  echo "kept existing ${SECRET_FILE}"
fi

cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/run-mac.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>StandardOutPath</key><string>${ROOT}/logs/worker.log</string>
  <key>StandardErrorPath</key><string>${ROOT}/logs/worker.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AVT_GPU_ROOT</key><string>${ROOT}</string>
  </dict>
</dict>
</plist>
EOF
chmod 644 "$PLIST_DEST"

echo "ComfyUI ${COMFY_REF} is at ${ROOT}/ComfyUI"
echo "Models, cache, and scratch stay under ${ROOT}. Nothing else on the T7 was changed."
echo "Register the worker from a machine credential (the secret stays in ${SECRET_FILE}):"
echo "  avt_gpu_worker_register is avt_worker_register with capability_manifest.lane = gpu"
echo "  os_name macOS, tool_versions comfyui 0.45.3, memory_bytes 8589934592, usable_bytes 5368709120, device mps, comfy_cloud false"
echo "Then: launchctl bootstrap gui/\$(id -u) ${PLIST_DEST}"
echo "Model weights are not downloaded. Put SAM2-small, BiRefNet, RVM, Depth Anything V2 small, and RAFT-small only under ${ROOT}/models."
