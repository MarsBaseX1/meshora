#!/bin/bash
set -uo pipefail
sudo dpkg --add-architecture i386
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wine32:i386
file /usr/bin/wine
wine --version || true
ls /usr/bin/wine* || true
