#!/bin/bash
set -euo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WINEDLLOVERRIDES="mscoree,mshtml="
npx vite build
npx electron-builder --win --x64 --dir
wine /home/box/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe \
  /workspace/meshora/release-build/win-unpacked/Meshora.exe \
  --set-icon /workspace/meshora/assets/icon.ico \
  --set-version-string FileDescription Meshora \
  --set-version-string ProductName Meshora \
  --set-version-string LegalCopyright "Copyright 2026 marsbasex.com" \
  --set-file-version 1.0.0 \
  --set-product-version 1.0.0.0 \
  --set-version-string InternalName Meshora \
  --set-version-string CompanyName marsbasex.com
npx electron-builder --win nsis --x64 --prepackaged release-build/win-unpacked
mkdir -p release
cp -f release-build/Meshora-Setup-1.0.0.exe release/Meshora-Setup-1.0.0.exe
ls -la release/Meshora-Setup-1.0.0.exe
echo FINAL_OK
