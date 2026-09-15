#!/usr/bin/env bash
set -euo pipefail

# FlyWire data is not part of this repository. The explicit environment flag
# records that the person running this script has accepted the applicable terms.
if [[ "${FLYWIRE_TERMS_ACCEPTED:-}" != "yes" ]]; then
  echo "FlyWire FAFB v783 is research/non-commercial data with attribution requirements."
  echo "Read THIRD_PARTY_LICENSES.md and rerun with: FLYWIRE_TERMS_ACCEPTED=yes $0"
  exit 2
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$project_root/data/flywire-v783-source"
source_url="https://storage.googleapis.com/flywire-data/codex/data/fafb/783/connections.csv.gz"

mkdir -p "$source_dir"
for product in connections classification coordinates; do
  curl --fail --location --retry 3 --output "$source_dir/$product.csv.gz" "${source_url/connections/$product}"
done
(cd "$project_root" && go run ./tools/build_flywire_pack.go)

echo "FlyWire brain pack created locally under data/brain-packs/."
