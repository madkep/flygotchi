# Third-party data and licenses

## MaleCNS v1.0

FlyGotchi can use a compact brain pack derived from the official MaleCNS v1.0
neuPrint dataset (`male-cns:v1.0`), retaining 800 high-connectivity neurons
and directed connections with at least five synapses. The source data and
generated pack are not included in this repository; run
`python3 tools/build_malecns_pack.py` after downloading the official tables.
MaleCNS is licensed CC-BY 4.0. Source and download instructions:
https://male-cns.janelia.org/download/

## FlyWire FAFB v783 (legacy)

This local installation can use a compact brain pack derived from the FlyWire FAFB v783 aggregated connectivity, classification, and representative-coordinate tables. It is research data and is **not included in this repository**. The source downloads and derived local pack are ignored by Git.

Use is subject to the FlyWire principles and data terms accepted by the local user. In particular, this project treats the data as non-commercial and attribution-required. Do not redistribute the source table or the derived pack without verifying the applicable FlyWire terms.

Sources: `https://storage.googleapis.com/flywire-data/codex/data/fafb/783/connections.csv.gz`, `classification.csv.gz`, and `coordinates.csv.gz` from the same FAFB v783 directory.

Relevant publications and annotations: Dorkenwald et al. (2024), Schlegel et al. (2024), and the FlyWire Consortium's FAFB v783 release. See the FlyWire annotations repository for current citations.

## Three.js

The browser terrarium vendors the Three.js 0.160.0 distribution in `web/three.min.js` under the MIT License. See `https://github.com/mrdoob/three.js/blob/r160/LICENSE`.
