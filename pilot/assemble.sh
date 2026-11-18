#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo 'Usage: bash pilot/assemble.sh NEW_OUTPUT_DIRECTORY' >&2
  exit 2
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output=$1
parent=$(cd "$(dirname "$output")" && pwd)
scratch=$(mktemp -d "$parent/.housing-pilot.XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
source_zip="$scratch/integration.zip"
source_url='https://raw.githubusercontent.com/leekm9335-eng/-/ffdd6052fcafe0446c6b3279548b3a74f3c1e864/Housing_IntegrationBridge_Work_v04_full_20261105.zip'
source_sha='a546635d7319acfcf456d156601298e86bd83168f3fabba5318342877245bbda'

curl --fail --silent --show-error --location --max-time 120 "$source_url" -o "$source_zip"
printf '%s  %s\n' "$source_sha" "$source_zip" | sha256sum --check --status
mkdir -- "$scratch/source"
unzip -q "$source_zip" 'baseline/local6/Code.gs' 'baseline/local6/full.zip' \
  'vendor/work-v03/src/*' 'vendor/work-v04/src/*' \
  'vendor/work-v04/fixtures_manifest.v2.json' 'vendor/work-v04/fixtures/*' \
  -d "$scratch/source"
cp -R -- "$root/bridge" "$root/b11" "$root/recovery" "$root/work-mvp" "$root/pilot" "$scratch/source/"
cp -- "$root/README.md" "$scratch/source/"
mkdir -- "$output"
cp -R -- "$scratch/source/." "$output/"
printf 'Assembled: %s\n' "$output"
