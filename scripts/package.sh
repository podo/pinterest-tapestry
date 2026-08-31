#!/bin/sh
set -eu

repository_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_dir="$repository_dir/dist"

mkdir -p "$output_dir"

package_connector() {
  connector_dir="$1"
  output_file="$2"
  shift 2
  rm -f "$output_file"
  cd "$repository_dir/$connector_dir"
  zip -q -X "$output_file" "$@"
  printf '%s\n' "$output_file"
}

package_connector \
  "io.github.podo.pinterest.account" \
  "$output_dir/Pinterest.tapestry" \
  plugin-config.json ui-config.json README.md plugin.js
