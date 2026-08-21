#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_DISABLE_SECURITY_WARNINGS=1
timeout 12 npx electron . --no-sandbox --disable-gpu 2>&1 | tee /tmp/meshora-electron-smoke.log
code=${PIPESTATUS[0]}
echo "electron_exit=$code"
exit 0
