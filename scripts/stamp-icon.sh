#!/bin/bash
set -uo pipefail
export WINEDLLOVERRIDES="mscoree,mshtml="
export WINEARCH=win64
EXE=/workspace/meshora/release-build/win-unpacked/Meshora.exe
RCEDIT=/home/box/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe
ICON=/workspace/meshora/assets/icon.ico
echo "using $(command -v wine)"
wine "$RCEDIT" "$EXE" \
  --set-icon "$ICON" \
  --set-version-string FileDescription "Meshora" \
  --set-version-string ProductName Meshora \
  --set-version-string LegalCopyright "Copyright 2026 marsbasex.com" \
  --set-file-version 1.1.0 \
  --set-product-version 1.1.0.0 \
  --set-version-string InternalName Meshora \
  --set-version-string CompanyName marsbasex.com
echo "rcedit_exit=$?"
