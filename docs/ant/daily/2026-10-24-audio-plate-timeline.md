# 2026-10-24 — Synchronized audio / Plate timeline observation

## Scope

Fresh branch `codex/ant-audio-plate-timeline-20261024` from `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. One seeded current-production natural window, seed `20261005`, target 180 simulated seconds. Production `src/` and its audio/birth laws remain unchanged. Evidence details and asset hashes are in [the evidence package](../evidence/2026-10-24-audio-plate-timeline/README.md).

The current controller default and UI audio volume were preserved. An initial trial used the older harness's 35% volume override, so it was excluded from this pass's results; the reported capture was rerun at volume `1.0`, output gain `0.7`, Base Off. The controller used its current default material locomotion resistance.

## Capture and validation

- Simulation `180.2333 s`; wall `180.2556 s`; AudioContext `180.2507 s`; float32 stereo PCM `180.2400 s` at 48 kHz.
- Final anchor / decoded PCM difference: 512 samples (`10.67 ms`). No PCM stretching or retiming; intermediate measured anchors remain unchanged.
- 722 anchors; 8,990 `FOOT_CONTACT` groups / 26,678 feet; 2 Plate births; 0 Nodule births; final Plate count 2.
- First birth P1 at `103.0167 s`; second P2 at `151.0167 s`; interval `48.0000 s`.
- Population `1→20`; activation `0→0.7145`.
- Observer snapshot/event audit added 0 LCG calls. Event counts, birth accumulation, sample ranges, clock anchors and state timeline validated.
- Raw delivery order contains 1,474 timestamp inversions across per-ant events. The original order is retained; rendering groups by exact event timestamp.
- Full evidence rendering repeated from the same capture; all 11 generated artifacts (excluding the README) were byte-identical.

## Observation and decision

Before P1, the 0–100 second buckets have zero output RMS. The 100–110 second birth bucket measures stereo RMS `0.00535`. No-birth intervals afterward still change (`0.00553` at 110–120 s, `0.01328` at 120–130 s, `0.00587` at 140–150 s); the P2 bucket measures `0.01491`, followed by `0.01649` and `0.01383` in no-birth buckets. The timeline therefore shows a coarse silent-to-textured transition and later fluctuation, without establishing cause.

Two Plate births arrive 48 seconds apart in the latter portion of this run. The snapshots show a route fan growing from the lower-center region toward the upper/right; formation is sparse and spatially associated with this connected route pattern in this window.

**Decision: MIXED.** Long-timescale audio change is visible on the fixed-scale timeline; much of the run is silent before the first Plate, followed by a low-frequency texture with local fluctuations. P1/P2 are clear visual timeline landmarks, but their audio association is not isolated from later contacts, population changes, or other material state. This is descriptive evidence only. No causal claim or production change is made.

## Validation

Added focused tests for the research timeline builder and renderer input contract (3). Existing fixed audio snapshot, audio overview, AntController, Plate-birth, and material-stratigraphy tests passed when executed directly with Node. `node --test` and Vite/esbuild needed child-process execution, which the default sandbox rejected with `spawn EPERM`; the requested browser capture and render completed using approved process access. Full build omitted because production source was untouched.
