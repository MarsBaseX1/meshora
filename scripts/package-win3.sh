#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WINEDLLOVERRIDES="mscoree,mshtml="
echo "=== dir ==="
npx electron-builder --win --x64 --dir
echo "dir_exit=$?"
echo "=== zip ==="
npx electron-builder --win zip --x64
echo "zip_exit=$?"
echo "=== nsis ==="
npx electron-builder --win nsis --x64
echo "nsis_exit=$?"
mkdir -p release
ls -la release-build
echo "--- artifacts ---"
find release-build -maxdepth 2 -type f \( -name '*.exe' -o -name '*.zip' -o -name '*.7z' \) -printf '%p %s\n'
for f in release-build/*.exe; do
  [ -f "$f" ] || continue
  echo "EXE $f"
  cp -f "$f" release/Meshora-Setup-1.0.0.exe
done
for f in release-build/*.zip; do
  [ -f "$f" ] || continue
  echo "ZIP $f"
  cp -f "$f" release/Meshora-1.0.0-win32-x64.zip
done
ls -la release
