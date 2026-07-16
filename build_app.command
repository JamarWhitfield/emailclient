#!/bin/bash
# Rebuilds the double-click "Fleur De Lis Outreach.app" from the latest code.
#
# Run this whenever app.py / main.py / email_template.py change. Staff do NOT
# need this file; it is only for whoever maintains the tool. After it finishes,
# a fresh "Fleur De Lis Outreach.app" appears in this folder.
#
# The finished app already includes Python, the Tk window library, and openpyxl
# (for reading Excel files), so the people who use it never install anything.

set -e
cd "$(dirname "$0")"

# Build with a Python that ships Tk so the window library is bundled correctly.
CANDIDATES=(
  "/opt/homebrew/bin/python3.11"
  "/usr/local/bin/python3.11"
  "python3.11"
  "python3"
)

PYTHON=""
for candidate in "${CANDIDATES[@]}"; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import tkinter" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Could not find a Python with Tk support."
  echo "On macOS with Homebrew, install it once with: brew install python-tk@3.11"
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Using: $PYTHON"
echo "Installing build tools and libraries..."
"$PYTHON" -m pip install --quiet --upgrade pyinstaller -r requirements.txt

APP_NAME="Fleur De Lis Outreach"

echo "Building $APP_NAME.app ..."
rm -rf build dist "$APP_NAME.spec"
"$PYTHON" -m PyInstaller --noconfirm --windowed \
  --name "$APP_NAME" \
  --collect-all openpyxl \
  --collect-all googleapiclient \
  --collect-all google_auth_oauthlib \
  --collect-all google \
  app.py

# Place the finished app next to this script for easy double-clicking.
rm -rf "$APP_NAME.app"
cp -R "dist/$APP_NAME.app" .

echo ""
echo "Done. '$APP_NAME.app' is ready in this folder."
echo "Keep .env and sent_log.csv in the same folder as the app."
read -r -p "Press Enter to close..."
