#!/bin/bash
# Build Debian package (.deb) in debtools container
# Container has all build dependencies pre-installed

set -e

echo "Building Debian package in Debian trixie container..."

# Mount parent directory so dpkg-buildpackage can write .deb files to ..
# which is accessible from the host
PARENT_DIR="$(dirname "$(pwd)")"
REPO_NAME="$(basename "$(pwd)")"

# Build the package inside debtools container
docker run --rm \
  -v "$PARENT_DIR:/workspace" \
  -w "/workspace/$REPO_NAME" \
  debtools:latest \
  dpkg-buildpackage -b -uc -us

# List generated packages
echo "📦 Generated packages:"
ls -lh ../*.deb

echo "✅ Package build complete"
