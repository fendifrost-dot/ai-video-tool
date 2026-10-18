# Build from the repo root:  docker build -f workers/edit-render/Dockerfile -t avt-edit-render .
# Run:                        docker run -e AVT_WORKER_SECRET=... avt-edit-render
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/edit-render ./scripts/edit-render
COPY supabase/functions/_shared ./supabase/functions/_shared
COPY workers/edit-render ./workers/edit-render
USER node
CMD ["node", "--experimental-strip-types", "workers/edit-render/worker.mjs"]
