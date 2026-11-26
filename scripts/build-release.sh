#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

# Determine version (<yy>.<major>.<minor>)
current_version=$(python3 -c 'import json; print(json.load(open("manifest.json", encoding="utf-8"))["version"])')
year_short=$(TZ=Asia/Ho_Chi_Minh date '+%y')
build_stamp=$(TZ=Asia/Ho_Chi_Minh date '+%d%m.%H%M%S')

new_version="$current_version"
if [[ "${1:-}" == "--bump-major" ]]; then
  IFS='.' read -r cur_y cur_maj cur_min <<< "$current_version"
  if [[ "$cur_y" == "$year_short" ]]; then
    new_version="${year_short}.$((cur_maj + 1)).0"
  else
    new_version="${year_short}.1.0"
  fi
elif [[ "${1:-}" == "--bump-minor" ]]; then
  IFS='.' read -r cur_y cur_maj cur_min <<< "$current_version"
  if [[ "$cur_y" == "$year_short" ]]; then
    new_version="${year_short}.${cur_maj}.$((cur_min + 1))"
  else
    new_version="${year_short}.0.1"
  fi
elif [[ -n "${1:-}" ]]; then
  new_version="$1"
fi

version_name="${new_version} (build ${build_stamp})"

# Update manifest.json with version and version_name
python3 - "$new_version" "$version_name" <<'PY'
import json
import sys

version, version_name = sys.argv[1], sys.argv[2]
with open("manifest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

data["version"] = version
data["version_name"] = version_name

with open("manifest.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

echo "Manifest updated: ${version_name}"

# Syntax & JSON validation
python3 -m json.tool manifest.json > /dev/null
if command -v node >/dev/null 2>&1; then
  node --check content/content.js
  node --check content/x-interceptor.js
  node --check background/service-worker.js
  node --check popup/popup.js
  echo "Syntax check passed."
fi

# Stage clean unpacked extension directory
dist_dir="$PWD/dist/QuickMediaDownloader"
release_dir="$PWD/releases"
zip_name="QuickMediaDownloader-${new_version}-build-${build_stamp}.zip"

rm -rf "$dist_dir"
mkdir -p "$dist_dir" "$release_dir"

cp manifest.json LICENSE "$dist_dir/"
cp -R background content popup icons "$dist_dir/"
find "$dist_dir" -name '.DS_Store' -delete

# Package release ZIP (with manifest.json at archive root)
rm -f "$release_dir/$zip_name"
(cd "$dist_dir" && zip -qr "$release_dir/$zip_name" .)

echo "Unpacked build: $dist_dir"
echo "Release ZIP:    $release_dir/$zip_name"
