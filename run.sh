#!/usr/bin/env bash
# Jalankan CleanBot 3D (Linux/macOS/Git Bash)
cd "$(dirname "$0")"
python -c "import fastapi, uvicorn" 2>/dev/null || python -m pip install fastapi uvicorn numpy
python server.py --open
