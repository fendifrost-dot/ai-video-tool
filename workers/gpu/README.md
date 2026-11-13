# GPU worker

Mac launchd service for ComfyUI. The run-book, the M1 8 GB tier table, and the install steps are in [`docs/gpu/GPU_WORKER.md`](../../docs/gpu/GPU_WORKER.md).

```bash
bash workers/gpu/install-mac.sh
```

The install root is `/Volumes/T7/AVT_GPU_Worker`. Cache and models stay there. The worker secret is a hash in `edit_render_workers`, not a service-role key and not a machine credential.
