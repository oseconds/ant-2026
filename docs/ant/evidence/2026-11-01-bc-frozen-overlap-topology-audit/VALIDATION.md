# Validation

## Frozen-input identity

The reproduction script verifies the SHA-256 and byte count of each required source file against its upstream evidence manifest before parsing it. It also records the hashes of all eight linked manifests in analysis/validation.json. The exact manifest digests are carried into manifest.json.

## Structural checks

All checks passed:

- exactly 163 saved slot receipts and 1,846 unique-X appearances;
- exact X-mask reconstruction of all overlap edges and 1,352 connected components;
- exact census of 231 contested components and 1,121 singletons;
- original B/C provenance records retained, including exact-X collapse into one {B,C} option;
- cross-channel pair classes independently reconstructed from masks;
- all 665 exact same-X pair cases and F-component containment records reconstructed;
- union masks and geometry reconstructed from member X masks;
- every contested union independently checked as 8-connected and represented by one frozen F component;
- clique number, independence number, and all maximum independent sets exhaustively recomputed for every contested graph (maximum graph order 12);
- deterministic objective-case identities and atlas generation;
- a separate post-generation aggregation over the saved pair, component, union, MIS, and F-confinement receipts; the independent sums and median checks matched (10,680 pairs, 231 contested components, 143 alpha=1, 88 alpha>1, 228 maximum sets, 664 exact-X-equals-F cases);
- exact 599/599 saved F-mask matches per seed;
- exact saved actual production Plate ID/count correspondence and timestamp parity;
- zero observer RNG calls; no simulation or replay;
- src/ and static/ unchanged against production authority.

## Saved-current-production comparison boundary

The opportunity packet and birth records identify bc045dc3caa5954df633ecbee37fbabcb8224f30. The Plate masks used for geometric context were saved under 1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44. The source ancestry, exact saved-source LF hashes, empty production source diff, all-anchor F parity, and birth ID/time parity were verified before use. This lets the report compare stored production shapes without replaying an old or new world.

The Plate geometry result remains descriptive. It does not validate the local X union as an adopted material shape.

## Output determinism

After final generation, analysis/*.json and visual/objective-atlas.svg are hashed in manifest.json and SHA256SUMS.txt. A second complete script run is required to reproduce identical hashes before commit. SVG is parsed as XML to verify a well-formed vector document. The independent arithmetic checks are kept in analysis/independent-arithmetic-review.json.

Hashes for workspace records use canonical staged Git blob bytes. In particular, docs/ant/README.md is normalized by Git for line endings; its checksum records the committed blob rather than a platform-specific checkout byte stream. All 19 listed staged blob hashes were checked against SHA256SUMS.txt before commit.

## Repository boundary

This pass changes only:

- scripts/ant-frozen-overlap-bc-topology-audit.cjs (read-only research processor);
- this evidence package;
- the dated daily record and daily index.

There is no production source, renderer, material, audio, RNG, or simulation-state change. No PR, merge, production adoption, capacity rule, winner rule, or Residence work is included.
