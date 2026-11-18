#!/usr/bin/env bash
# Uploads the site to Neocities using the API key in NEOCITIES_API_KEY.
#
#   ./deploy.sh            upload everything
#   ./deploy.sh --dry-run  just list what would be uploaded
#
# Only index.html and the site folders below are uploaded, so preview files
# and this script never go live. Files on Neocities that aren't here are left alone.

set -euo pipefail
cd "$(dirname "$0")"

folders=(css js img art pages Fonts buttons)

files=(index.html)
while IFS= read -r -d '' f; do
    files+=("$f")
done < <(find "${folders[@]}" -type f ! -name '.*' ! -name 'desktop.ini' -print0 2>/dev/null)

echo "Files to upload (${#files[@]}):"
printf '  %s\n' "${files[@]}"

if [ "${1:-}" = "--dry-run" ]; then
    exit 0
fi

if [ -z "${NEOCITIES_API_KEY:-}" ]; then
    echo "NEOCITIES_API_KEY isn't set. Add it, then restart VS Code." >&2
    exit 1
fi

# each file is sent as  path-on-neocities=@path-here
args=()
for f in "${files[@]}"; do
    args+=(-F "$f=@$f")
done

echo "Uploading..."
response=$(curl -sS -H "Authorization: Bearer $NEOCITIES_API_KEY" "${args[@]}" https://neocities.org/api/upload)
echo "$response"

if [[ "$response" != *'"success"'* ]]; then
    echo "Upload failed (see the message above)." >&2
    exit 1
fi
