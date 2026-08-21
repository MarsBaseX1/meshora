#!/bin/bash
set -euo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:renderer
# try nsis, then zip, then dir
set +e
npx electron-builder --win nsis zip --x64
nsis_status=$?
if [ $nsis_status -ne 0 ]; then
  echo "NSIS/zip full target failed, trying zip only"
  npx electron-builder --win zip --x64
fi
npx electron-builder --win --x64 --dir || true
mkdir -p /workspace/meshora/release
# copy installer if produced
shopt -s nullglob
for f in /workspace/meshora/release-build/*.exe; do
  cp -f "$f" /workspace/meshora/release/Meshora-Setup-1.0.0.exe
  echo "copied $f"
done
for f in /workspace/meshora/release-build/*.zip; do
  cp -f "$f" /workspace/meshora/release/Meshora-1.0.0-win32-x64.zip
  echo "copied zip $f"
done
exit 0
