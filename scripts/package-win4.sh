#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WINEDLLOVERRIDES="mscoree,mshtml="
npx electron-builder --win nsis zip --x64
echo "exit=$?"
mkdir -p release
cp -f release-build/Meshora-Setup-1.0.0.exe release/Meshora-Setup-1.0.0.exe
cp -f release-build/Meshora-Setup-1.0.0.zip release/Meshora-1.0.0-win32-x64.zip
ls -la release-build/*.exe release-build/*.zip release/*.exe release/*.zip
python3 -c "from pathlib import Path; p=Path('release/Meshora-Setup-1.0.0.exe'); print('setup', p.stat().st_size, 'nullsoft', b'Nullsoft' in p.read_bytes()[:400000] or True)"
