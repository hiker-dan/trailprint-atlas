#!/bin/bash
# Double-click me in Finder to log a new hike.
# (Drop the GPX + photos into intake/ first.)
cd "$(dirname "$0")"
python3 tools/new-hike.py
echo ""
read -r -p "All done — press Enter to close this window. "
