#!/bin/bash
set -uo pipefail
cd /workspace/meshora
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --win nsis --x64 --prepackaged release-build/win-unpacked
echo "exit=$?"
mkdir -p release
cp -f release-build/Meshora-Setup-1.0.0.exe release/Meshora-Setup-1.0.0.exe
ls -la release/Meshora-Setup-1.0.0.exe
python3 -c "from pathlib import Path; p=Path('release/Meshora-Setup-1.0.0.exe'); b=p.read_bytes(); print('size', p.stat().st_size, 'nullsoft', b'Nullsoft' in b[:800000])"
