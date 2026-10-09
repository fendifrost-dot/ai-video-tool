#!/bin/bash
# Run this as its own command: a shell whose command line names these processes is matched and killed with them.
pkill -f "fake_backend.py"; pkill -f "vite.js dev --port 5200"; sleep 1; exit 0
