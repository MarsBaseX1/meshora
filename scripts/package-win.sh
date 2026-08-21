#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WINEDLLOVERRIDES="mscoree,mshtml="
mkdir -p release release-build
echo "=== trying NSIS ==="
npx electron-builder --win nsis --x64
nsis=$?
echo "nsis_exit=$nsis"
echo "=== trying zip ==="
npx electron-builder --win zip --x64
zip=$?
echo "zip_exit=$zip"
echo "=== trying dir ==="
npx electron-builder --win --x64 --dir
dir=$?
echo "dir_exit=$dir"
shopt -s nullglob
for f in release-build/*.exe release-build/**/*.exe; do
  echo "EXE $f"
  cp -f "$f" release/Meshora-Setup-1.0.0.exe || true
done
for f in release-build/*.zip; do
  echo "ZIP $f"
  cp -f "$f" release/Meshora-1.0.0-win32-x64.zip || true
done
ls -la release-build || true
ls -la release || true
ls -la release-build/win-unpacked 2>/dev/null | head || true
echo "DONE nsis=$nsis zip=$zip dir=$dir"
