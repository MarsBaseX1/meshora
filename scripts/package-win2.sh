#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WINEDLLOVERRIDES="mscoree,mshtml="
echo "=== NSIS ==="
npx electron-builder --win nsis --x64
echo "nsis_exit=$?"
echo "=== ZIP ==="
npx electron-builder --win zip --x64
echo "zip_exit=$?"
mkdir -p release
ls -la release-build
shopt -s nullglob
for f in release-build/*.exe; do
  echo "FOUND_EXE $f $(stat -c%s "$f")"
  cp -f "$f" release/Meshora-Setup-1.0.0.exe
done
for f in release-build/*.zip; do
  echo "FOUND_ZIP $f $(stat -c%s "$f")"
  cp -f "$f" release/Meshora-1.0.0-win32-x64.zip
done
ls -la release
