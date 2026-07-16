#!/bin/bash
# Double-click launcher for the Fleur De Lis renewal outreach desktop app.
# Staff can open this file from Finder to start the app without using Terminal.
#
# First-time setup on a new Mac may require allowing the file to run:
#   Right-click this file -> Open -> Open.

# Move to the folder this script lives in so file paths resolve correctly.
cd "$(dirname "$0")" || exit 1

# The desktop app needs a Python that includes Tk (the windowing library).
# Some Python builds (for example Homebrew python@3.14) do not ship Tk, so we
# search the common interpreters and pick the first one whose Tk works.
CANDIDATES=(
  "python3.11"
  "python3.12"
  "python3.10"
  "python3"
  "python"
  "/opt/homebrew/bin/python3.11"
  "/usr/local/bin/python3.11"
  "/usr/bin/python3"
)

PYTHON=""
for candidate in "${CANDIDATES[@]}"; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c "import tkinter" >/dev/null 2>&1; then
      PYTHON="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Could not find a Python with Tk support."
  echo "On macOS with Homebrew, install it once with:"
  echo "  brew install python-tk@3.11"
  echo "Then double-click this file again."
  read -r -p "Press Enter to close..."
  exit 1
fi

"$PYTHON" app.py
