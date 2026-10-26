# 2026-10-27 — Material smooth substrate relief shadow

## Question

Can a continuous renderer-derived grayscale field distinguish retained material from pheromone without an explicit boundary mark or internal texture?

## Implemented facts

- Started from research parent `75412739a6ea12e858ec2cf739f0a93279d4ada6` on `codex/ant-material-smooth-substrate-relief-20261027`; fresh `origin/main` was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Added four opt-in renderer views. View 1 is the existing soft alpha-96 reference; Views 2–4 share a continuous pseudo-surface field at nominal alpha 32, with directional modulation absent, ±10, or ±24. Production defaults, world rules, and pheromone rendering remain unchanged.
- Used one H1 isotropic diagnostic world: seed `20261005`, first Plate at 75.016666667 s, endpoint at +30 s. All views used each same detached snapshot; rendering consumed no simulation RNG.
- Preserved pre/post/+15/+30 s native stills and a synchronized 35.1 s lossless video window from first Plate −5 s to +30 s. Review opens with neutral View 1–4 labels and a free-description prompt only.

## Technical observations

- H1 milestones, final state fingerprint, RNG/events, and first-Plate timing match the previous H1 evidence; all four View 1 milestone PNGs match their prior checkpoints byte for byte.
- At +30 s, Views 2–4 share 43,055 canonical support pixels, 60,173 nonzero-coverage pixels, 43,346 half-coverage pixels, and a 4.866 px observed 10–90% transition. Half-coverage expansion/shrinkage is 1,566/1,275 pixels; nonzero influence extends to 17,118 pixels outside canonical support.
- The registered Gaussian attenuates the 96-grid cell-period component to gain 0.01956. Boundary second-difference RMS drops from 0.48477 raw to 0.10806 filtered. This indicates the raw staircase is substantially suppressed in the field, not that no visual grid artifact exists.
- At the endpoint, influence-area mean alpha is 22.947 / 22.938 / 22.941 for Views 2/3/4; realized ranges are 0–32 / 0–42 / 0–55. Material-only mean darkness stays close across views. Technical metrics do not measure perceived surface identity.
- Old pixels outside the 43 px registered locality radius were unchanged as support grew; unchanged topology caused no field/render byte changes or deterministic cache rebuilds.
- The event-window videos are native 640×640, 351 frames each, lossless, with exact +30 s PNG endpoint parity. The viewer smoke check found no page errors.

## Review and interpretation boundary

Human free-description review is pending. No artistic winner was selected. A smooth field and directional luminance are not evidence of literal physical depth. The H1 control is diagnostic and is not a production-heading recommendation. The measurements describe this seed and early event window only.

Full evidence, field registration, media receipts, and validation live in [the evidence package](../evidence/2026-10-27-material-smooth-substrate-relief/README.md). The canonical ANT guide was not changed.
