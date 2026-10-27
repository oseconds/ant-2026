# Contact-history causal readout — geometry preflight

**Decision: MANIPULATION INVALID / INCONCLUSIVE. Stop before artist-facing capture.** The registered relocation family did not produce a sufficiently matched non-causal control. No A/B images, videos, or artist comparison were made.

## Question and boundary

This pass asked whether persistent visual evidence at actual supported foot-contact locations reads differently from the same accumulated marks placed elsewhere on the same Plate. It tests only post-birth contact-history rendering. It does not recover the contacts that formed a Plate, validate a material phenotype, or add a simulation law.

This result concerns the registered relocation family and scene. It does not establish that every deterministic within-Plate reassignment is invalid. No perceptual result was collected, so exact contact provenance cannot yet be judged worth carrying into a later Material Character pass.

## Provenance and registered setup

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Branch: `codex/ant-contact-history-causal-readout-20261027`, created directly from that main SHA; parent: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Contact-readout prerequisite: `9233500dad65ff5bbd09d8b604f4ea86b2208932`.
- Validated H1 reference: `bee3a6908b36e23c826e1fde00d461b426c75992`.
- Bayer artist response source: `da70d82822fa4d424744eaf6d50c53a728029ace`; the verbatim response is retained in [`PRIOR-REVIEWS.md`](PRIOR-REVIEWS.md).
- Seed `20261005`, current-G defaults, 60 Hz, 640×640, DPR 1, Chrome `156.0.8078.48`, Node `v22.23.2`; no audio, DSP, or AudioContext.
- H1 is an in-memory accepted-heading transform only: `heading: wrapAngle(-Math.PI + TAU * this.random())`. It remains a research diagnostic, not a production proposal.
- Registered interval: tick 4501 / 75.016666667 s, first Plate birth, through tick 6301 / 105.016666667 s (+30 model seconds).
- Executed preflight runner SHA-256: `f9abc2c2a526787e129fc04723af30e1886a7b07dd517b18d0a0df35ae76134e`; helper SHA-256: `55d0b2dcf88afbc3ac354e9a626d90791dc40072fa71049a3382c5e7272f77f6`. Both and inspected production-source hashes are recorded in `preflight.json`.

The registered glyph was a 2.5 native-pixel black circle at alpha 72/255, accumulated source-over without cap or decay, beneath production pheromone and ants. It was never rendered because the control failed preflight.

## Event source and A/B control

The preflight observed the production `SurfaceAudioBridge` exposed-foot routing before its enabled/ready transport gate. A ready recording bridge and a disabled bridge observed the same eligible feet; only the ready bridge posted strikes. Eligibility, not AudioWorklet posting, was the registered visual-history source.

The intended A view placed marks at exact eligible foot positions while their event-time Plate remained both the physical and canonical display owner. B used the same events, timing, Plate and leg identities, glyph, accumulation, and owner visibility rule, but relocated each mark through one rigid isometry around the centroid of its Plate's immutable 96×96 mask.

Before candidate comparison, the registered transform set was fixed to `rotate-180`, `reflect-x`, `reflect-y`, `rotate-90-cw`, `rotate-90-ccw`, `reflect-diagonal`, and `reflect-antidiagonal`. A B placement counted only when it remained inside the same Plate under both physical routing and 640→96 display ownership and was at least 12 native pixels from its source. A transform needed to place at least 90% of the 760 source events with valid event-time display ownership to qualify for capture. Ranking used valid-event count, unique destination pixels, same-pixel count, then the fixed order. No images or visual preference informed selection.

## H1 trajectory and event parity

| Check | Result |
| --- | ---: |
| First Plate | tick 4501 / 75.016666667 s |
| Second Plate | tick 5161 / 86.016666667 s |
| Endpoint | tick 6301 / 105.016666667 s |
| Prior H1 state/RNG anchors matched | 1,052 / 1,052 |
| Final RNG | state 3,450,053,109; 45,352 calls |
| Event digest vs prerequisite | exact match: `0560e2a0b996a87812d13c54d03e25477ec8c7c82be3773299bab5173b222d52` |
| Grouped `FOOT_CONTACT` events | 4,353 |
| Individual feet / SurfaceField responses | 12,871 / 12,871 |
| Exposed eligible contact routes | 816 |
| Ready bridge eligible routes / posts | 816 / 816 |
| Disabled bridge same eligible routes / posts | 816 / 0 |
| Eligible routes with source display owner matching event Plate | 760 / 816 |

Eligible routes by event-time Plate were `trail-plate-1`: 264 and `trail-plate-2`: 552. These are route counts, not rendered-mark counts. No glyph-level milestone counts were collected: A/B visible marks, hidden-by-burial/support marks, unique mark bins, glyph coverage, overlap, and saturation remain unmeasured because rendering stopped at preflight.

The H1 world and an independently advanced twin matched RNG and emitted-event streams every tick. Public snapshot hashes matched at all 1,052 recorded anchors. Route observation left event/response inputs unchanged. These are replay and observer checks; no A/B renderer parity is claimed because no candidate renderer was run.

## Relocation manipulation result

All seven registered Plate-local D4 isometries were measured against support and separation only.

| Transform | Supported targets | Valid / 760 | Valid ratio | Unique destination pixels | Same source/destination pixel pairs | Median valid separation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `reflect-x` | 409 | 354 | 46.58% | 347 | 0 | 52.46 px |
| `rotate-90-cw` | 272 | 257 | 33.82% | 250 | 0 | 43.40 px |
| `rotate-180` | 246 | 239 | 31.45% | 236 | 0 | 61.33 px |
| `reflect-diagonal` | 275 | 220 | 28.95% | 213 | 0 | 39.35 px |
| `reflect-y` | 285 | 203 | 26.71% | 200 | 0 | 37.99 px |
| `rotate-90-ccw` | 202 | 189 | 24.87% | 186 | 0 | 38.09 px |
| `reflect-antidiagonal` | 231 | 173 | 22.76% | 170 | 0 | 32.18 px |

`reflect-x` ranked first, but only 354/760 (46.58%) met both same-owner support and the 12 px separation. Of its 760 candidate placements, 409 retained support; 55 supported targets failed the separation threshold. It missed the preregistered 90% rule by a wide margin. A and B visible counts would therefore diverge materially, so a comparison would not isolate contact provenance.

The geometry audit does not prove that no other reassignment can work. It shows that this preselected rigid-isometry family cannot provide the registered match in this H1 world. The stop rule forbids inventing and evaluating a new placement distribution inside this pass.

## Assets and artistic status

- `preflight-contacts.jsonl`: event routes, exact contact positions, event-time ownership, and each transform's target position, physical/display owner, support and separation.
- `preflight.json`: environment, source hashes, replay summary, threshold, and all transform metrics.
- `parity-anchors.json`: sampled full public-state/RNG anchors.
- `PLAN.md`: rules registered before any candidate comparison.
- `attempts/`: five disclosed preflight-runner corrections; none produced candidate images or an artistic result.
- `attempts/review-correction-01/`: independently reviewed tie-break indexing correction and same-state geometry rerun; candidate selection and support results stayed unchanged.
- Artist review: **not presented**. No comparison asset exists and no artist response was recorded.

No stills, videos, viewer, or explanatory image were created. The `stills/` and `video/` output folders were removed because they contained no assets.

## Technical validation and limits

Production `src/` matched fresh `origin/main` with no diff. H1 remained in-memory and research-only. This preflight establishes the registered H1 trajectory and event source and identifies a failed relocation control. It does not validate glyph visibility, accumulation appearance, ant readability, an A/B renderer, or any artist interpretation.

- Runner syntax check: passed.
- Focused relocation tests: 4/4 passed, including the same-pixel filtering regression case.
- Full `npm test`: 343/343 passed.
- `npm run build`: passed. Existing warnings remain for two Zod comment annotations and the 1,161.66 kB `app` chunk.
- `git diff --check`: passed.
- Recomputed all seven support, valid-count, unique-pixel, same-pixel, and median-separation summaries from the saved per-contact targets: exact match.
- Fresh independent review: no blockers; see [`INDEPENDENT-REVIEW.md`](INDEPENDENT-REVIEW.md).
