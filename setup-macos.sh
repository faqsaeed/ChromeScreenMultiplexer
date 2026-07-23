#!/bin/zsh

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: ./setup-macos.sh <Chrome extension ID>" >&2
  exit 1
fi

SCRIPT_DIR=${0:A:h}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if [[ ! -d "/Applications/Google Chrome.app" ]]; then
  echo "Google Chrome was not found in /Applications." >&2
  exit 1
fi

cd "$SCRIPT_DIR/native-host"
npm install --omit=dev
chmod +x host.mjs run-host.sh

cd "$SCRIPT_DIR"
node scripts/install-native-host.mjs "$1"

echo "Setup complete. Reload the extension from chrome://extensions."
