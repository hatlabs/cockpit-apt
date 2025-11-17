#!/bin/bash
# Build Debian package (.deb)
# Installs build dependencies and builds the package

set -e

echo "Installing build dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  build-essential dpkg-dev debhelper dh-python \
  python3-all python3-apt python3-hatchling \
  nodejs npm

echo "Building Debian package..."

# Build the package
dpkg-buildpackage -b -uc -us

# List generated packages
echo "📦 Generated packages:"
ls -lh ../*.deb

echo "✅ Package build complete"
