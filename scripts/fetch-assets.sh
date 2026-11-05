#!/usr/bin/env bash
# Fetch the KayKit Medieval Hexagon Pack 1.0 (CC0) glTF sources into assets-src/kaykit/.
# The sources are not committed: only the sprites pre-rendered from them are.
# Pinned to a fixed upstream commit so the sprites can be reproduced.
set -euo pipefail

REPO="https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0.git"
COMMIT="84fa4e91af6a88989be7c99e0891cede11f2ca38"
SUBDIR="addons/kaykit_medieval_hexagon_pack/Assets/gltf"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/assets-src/kaykit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$TMP" init -q
git -C "$TMP" remote add origin "$REPO"
git -C "$TMP" sparse-checkout set --no-cone "/$SUBDIR/" "/LICENSE.txt"
git -C "$TMP" fetch -q --depth 1 --filter=blob:none origin "$COMMIT"
git -C "$TMP" checkout -q FETCH_HEAD

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$TMP/$SUBDIR/." "$DEST/"
cp "$TMP/LICENSE.txt" "$DEST/LICENSE.txt"
echo "$COMMIT" > "$DEST/COMMIT"

echo "KayKit glTF sources ready in assets-src/kaykit ($(find "$DEST" -type f | wc -l) files)"
