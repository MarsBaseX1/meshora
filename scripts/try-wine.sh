#!/bin/bash
set -uo pipefail
if command -v wine >/dev/null 2>&1; then
  wine --version
  exit 0
fi
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wine64 wine
command -v wine && wine --version
