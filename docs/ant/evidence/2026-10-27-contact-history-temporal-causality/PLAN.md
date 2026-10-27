# Contact-history temporal-causality shadow — preregistration

## Question

With the same events, glyphs, event-time counts, and final per-Plate position multiset, does exact foot-to-mark timing change how accumulated contact history reads?

This pass tests temporal event-to-position correspondence only. It does not claim that a mark is a material phenotype or that the Plate-formation law preserves every contact that formed a Plate.

## Provenance and fixed world

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- New branch is created directly from that SHA; the failed geometry experiment is not its parent.
- Failed rigid-relocation reference: `394bd8136601c832a49b521f47d1ae446a17d0ed`, `docs/ant/evidence/2026-10-27-contact-history-causal-readout/`; its result remains manipulation-invalid / inconclusive.
- Contact-readout prerequisite: `9233500dad65ff5bbd09d8b604f4ea86b2208932`.
- H1 accepted-heading reference: `bee3a6908b36e23c826e1fde00d461b426c75992`.
- Seed `20261005`, current-G defaults, H1 isotropic accepted-heading transform, 60 Hz, 640×640, DPR 1, no audio/DSP.
- Fixed interval: tick 4501 / 75.016666667 s through tick 6301 / 105.016666667 s. Expected references are 816 routed feet and 760 with matching event-time display ownership; both must be remeasured.

## Registered renderer and visibility

Both views use one black grayscale circle, 2.5 native-pixel diameter, alpha 72/255, source-over accumulation, no decay and no cap. Marks are inserted by an in-memory patch to `AntRenderer` after material and before the unchanged pheromone pass; ants remain on top. Material fill and all other material overlays are disabled. Production files under `src/` remain byte-identical to fresh main.

A mark remains archived after its event and is drawn only while that event's Plate is both the current physical owner and the current canonical display owner at its coordinate. Buried or unsupported history is not revealed.

## Registered event set and matching

The source event set is the individual exposed routed feet whose exact event-time Plate also owns the coordinate in the canonical 96-grid display topology. Report this set both as a fraction of all routed events and as the assignment-coverage denominator. A source outside that set cannot be shown under the registered current-owner rule and is excluded from both views.

Before producing any artist-facing candidate media:

1. Sort eligible contact event instances by `(Plate ID, event time, event ID)`.
2. For each Plate, create directed candidate edges `i → j` only when `i != j`, `j` is another eligible event-position instance from that Plate, and `j`'s exact position is physically and canonically display-supported by that Plate at event `i`'s event-time topology.
3. Reject edges under 4 native pixels or whose source and target centers fall in the same native pixel. Sort remaining neighbors by descending Euclidean distance, then stable target event ID.
4. Run one deterministic augmenting-path maximum bipartite matching per Plate, with sources and neighbors in that fixed order. Keep only closed cycles of length at least two from the resulting one-to-one assignment. The retained cycles form a bijective derangement over one common event-instance subset; paths and unmatched nodes are excluded from both views.
5. Do not retry with a different ordering or matching after seeing counts or media. The gate is at least 95% of the eligible source set, zero same-native-pixel pairs, every retained edge at least 4 px, and pooled median separation at least 12 px. Otherwise stop as manipulation-invalid / inconclusive without candidate capture.

This deterministic matching is a registered, bounded assignment method; it is not a claim of globally maximum cycle coverage. Report unmatched/path events by Plate, full source denominator, retained subset, per-Plate coverage, minimum, median, and same-pixel count.

## Conditions

- **A — temporally causal:** matched event `i` adds its mark at its own exact position and event time.
- **B — temporally decoupled:** the same matched event `i` adds its mark at its assigned other event's position, preserving its own event time and Plate identity.

The matched subset gives identical event-time mark-count curves and identical per-Plate position multisets after all events. Current-owner visibility may temporarily differ because event timing is reassigned among locations; measure it and do not normalize it away. Endpoint convergence is expected when ownership permits.

## Replay and media

Run one deterministic H1 world for preflight, then replay the exact same H1 stream once for capture. A and B render from each identical capture-run snapshot in lockstep; assert state/RNG/event parity against preflight. This repeated deterministic replay is a capture method, not a candidate-specific simulation.

Capture ticks 4501–6301 inclusive at 30 fps by sampling every two 60 Hz ticks, giving 901 frames. The first-to-endpoint sample span is exactly 30.000 s; the container duration is 30.033333 s because both endpoints are included. Produce separate native 640×640 videos and a synchronized side-by-side review page. Encode captured PNG frames with a lossless video codec and verify decoded frame count and RGB hashes. Save native stills at tick 4501, 5401 (+15 s), and 6301 (+30 s). Video frames contain no text or explanatory overlay. Keep assignment diagnostics separate from artist-facing assets.

Artist page shows only `View 1` / `View 2` and first prompt: `무엇이 달라 보이고, 어떤 점이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.` The display order is selected by the low bit of SHA-256 over a fixed pass-specific label, independent of simulation RNG; the key is stored outside the viewer. Do not disclose condition meaning before the first response.

## Stop and interpretation boundary

If the assignment gate fails, stop before A/B rendering and report the attempt as manipulation-invalid / inconclusive. If it passes, stop after parity validation, native review media, evidence, tests/build, commit and push. Do not add alternate glyphs, mappings, mechanisms, production changes, or further tuning in this pass.

Technical validity does not establish perceptual or artistic success. A favorable A response supports only this glyph and scene: immediate contact-to-mark correspondence may contribute to accumulated-history reading.
