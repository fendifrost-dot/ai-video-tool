#!/bin/bash
# Starts the stand-in backend (:54399) and the real app's dev server (:5200) pointed at it.
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"; : > backend.log
setsid nohup python3 fake_backend.py > backend.out 2>&1 &
cd "$ROOT"
VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=local-key SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local-key \
  setsid nohup node node_modules/vite/bin/vite.js dev --port 5200 --strictPort --host 127.0.0.1 > "$HERE/app.log" 2>&1 &
echo "started: backend http://127.0.0.1:54399 · app http://127.0.0.1:5200 (give the app ~15 s)"
