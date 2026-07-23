#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_PATH_FILE="$SCRIPT_DIR/.node-path"

if [ ! -f "$NODE_PATH_FILE" ]; then
  echo "Native host is not configured. Run setup-macos.sh again." >&2
  exit 1
fi

NODE_BIN=$(sed -n '1p' "$NODE_PATH_FILE")

if [ ! -x "$NODE_BIN" ]; then
  echo "Configured Node.js executable is unavailable. Run setup-macos.sh again." >&2
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/host.mjs"
