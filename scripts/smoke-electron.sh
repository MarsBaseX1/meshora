#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export ELECTRON_ENABLE_LOGGING=1
timeout 8 npx electron . --no-sandbox --disable-gpu 2>&1 | tee /tmp/meshora-electron-smoke2.log
echo electron_exit=${PIPESTATUS[0]}
