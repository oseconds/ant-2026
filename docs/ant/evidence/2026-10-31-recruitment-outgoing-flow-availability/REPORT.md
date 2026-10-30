# Accepted-spawn outgoing-flow availability

## Decision

**GO under the authored recurrence gate.** All three current-production seeds passed both locked conditions. This authorizes only one separate isotropic-versus-outgoing-flow comparison. No heading was changed here; no candidate or Residence run was executed.

## Authority and implementation fact

The run source is exact current production authority origin/main at commit 301f0740c9fe2e0697e31a716f7226cb2112ede7, parent 0aa5abb61344bf945a8175686126adddc2812bff. It includes retained-material 10% desired-speed resistance, the A material-conditioned turn-rate ceiling, and the D material-conditioned same-flow headway. Pheromone remains causal; renderer overlay default Off is presentation only. See the [authority commit](https://github.com/oseconds/ant-2026/commit/301f0740c9fe2e0697e31a716f7226cb2112ede7), [production controller](../../../../src/lib/agents/ant/AntController.js), and [A/D adoption record](../2026-10-30-material-feedback-ad-production-adoption/README.md).

The observer is confined to [the research runner](../../../../scripts/ant-recruitment-outgoing-flow-availability.js). Runtime wrappers capture tick-entry positions and read live post-collision positions at the accepted-spawn boundary. The observer identifies the candidate placement from the two existing position draws and checks production clearance. The next random call occurs only after the production clearance check passes; the observer samples immediately before that heading draw. It forwards each random call once and verifies the accepted ant position matches the observed candidate. It does not change heading, schedule, placement, controller behavior, or production source.

At the boundary, the observed segments are the just-completed tick’s realized movement for ants still live after collision and retirement. Segment midpoint radius applies the exact 0.018 < r ≤ 0.085 band; realized speed is segment length / (1/60 s), and outward means positive midpoint-radial dot displacement. The first accepted spawn at initialization has no previous completed segment and is recorded as N=0, unavailable. Full event rows retain every eligible segment and computed q, R, phi, and w.

Run conditions: seeds 20261005, 20261006, 20261007; 36,000 fixed 1/60 s ticks per seed; 600 model seconds; no audio bridge or renderer; production material feedback remains default On. No production source file changed.

## Observer parity

Seed 20261005 paired an uninstrumented production controller with the observer-wrapped controller under the same LCG seed, in lockstep for all 36,000 ticks. Every tick matched RNG state and call count, simulation clock, spawn/retirement counters, next ID, next scheduled spawn, and complete agent state. Full public world snapshots matched at initialization and every 1 s through 600 s: 600 timed checks. Final RNG state/calls and accepted-spawn count matched. Result: **PASS**. Exact receipt is in analysis/summary.json.

The runner also checks the locked production source constants and laws, accepted-position equality, one event per accepted spawn, 600 s duration, and production material resistance. Independent readback rederived N, eligibility, q, R, w, availability, and every temporal-window count from the saved event rows.

## Availability and recurrence

| Seed | Accepted spawns | N ≥ 3 | N ≥ 3 and R > 1e−9 | Availability | Supported windows | Gate |
|---|---:|---:|---:|---:|---:|---|
| 20261005 | 769 | 138 | 138 | 17.95% | 10 / 10 | Pass |
| 20261006 | 819 | 127 | 127 | 15.51% | 9 / 10 | Pass |
| 20261007 | 790 | 137 | 137 | 17.34% | 10 / 10 | Pass |

Every event with N ≥ 3 also had R > 1e−9. No N ≥ 3 event was rejected as numerically directionless.

### Eligible ant count N across all accepted spawns

| N | 20261005 | 20261006 | 20261007 |
|---:|---:|---:|---:|
| 0 | 109 | 105 | 99 |
| 1 | 288 | 274 | 281 |
| 2 | 234 | 313 | 273 |
| 3 | 119 | 107 | 120 |
| 4 | 15 | 20 | 17 |
| 5 | 4 | 0 | 0 |
| 6+ | 0 | 0 | 0 |

### R and diagnostic w distributions

R and w are defined only for N ≥ 3. The event JSON contains full precision values for every accepted spawn. These tables give nearest-rank quantiles and fixed-bin counts; displayed values are rounded to three decimals.

| Seed | Count | R min | p10 | p25 | Median | Mean | p75 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 138 | 0.457 | 0.681 | 0.742 | 0.838 | 0.825 | 0.917 | 0.972 | 0.998 |
| 20261006 | 127 | 0.558 | 0.686 | 0.734 | 0.810 | 0.815 | 0.892 | 0.959 | 0.999 |
| 20261007 | 137 | 0.440 | 0.626 | 0.725 | 0.808 | 0.805 | 0.896 | 0.961 | 0.999 |

| Seed | Count | w min | p10 | p25 | Median | Mean | p75 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 138 | 0.307 | 0.381 | 0.536 | 0.748 | 0.798 | 1.034 | 1.208 | 1.842 |
| 20261006 | 127 | 0.304 | 0.415 | 0.606 | 0.841 | 0.825 | 1.055 | 1.191 | 1.556 |
| 20261007 | 137 | 0.304 | 0.412 | 0.595 | 0.845 | 0.855 | 1.082 | 1.363 | 1.892 |

R histogram bins are [0,0.1), [0.1,0.25), [0.25,0.5), [0.5,0.75), [0.75,0.9), and [0.9,1].

| Seed | 0–0.1 | 0.1–0.25 | 0.25–0.5 | 0.5–0.75 | 0.75–0.9 | 0.9–1 |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 0 | 0 | 1 | 37 | 54 | 46 |
| 20261006 | 0 | 0 | 0 | 37 | 61 | 29 |
| 20261007 | 0 | 0 | 3 | 39 | 61 | 34 |

w histogram bins are [0.3,0.7), [0.7,1.2), [1.2,1.8), [1.8,2.4), and [2.4,π] radians.

| Seed | 0.3–0.7 | 0.7–1.2 | 1.2–1.8 | 1.8–2.4 | 2.4–π |
|---|---:|---:|---:|---:|---:|
| 20261005 | 59 | 64 | 14 | 1 | 0 |
| 20261006 | 44 | 72 | 11 | 0 | 0 |
| 20261007 | 50 | 66 | 20 | 1 | 0 |

Available q direction uses an equal-weight circular mean over available accepted-spawn events; concentration is the circular resultant length.

| Seed | Mean direction (rad) | Mean direction (deg) | Circular concentration |
|---|---:|---:|---:|
| 20261005 | −1.561 | −89.45° | 0.944 |
| 20261006 | −1.572 | −90.09° | 0.943 |
| 20261007 | −1.574 | −90.18° | 0.943 |

### Fixed 60-second support

Each cell is available accepted spawns / accepted spawns in that window, then availability percent. The denominator remains accepted spawns only.

| Seed | 0–60 | 60–120 | 120–180 | 180–240 | 240–300 |
|---|---|---|---|---|---|
| 20261005 | 2/33 (6.1%) | 4/53 (7.5%) | 7/77 (9.1%) | 12/89 (13.5%) | 14/89 (15.7%) |
| 20261006 | 0/45 (0.0%) | 6/79 (7.6%) | 16/92 (17.4%) | 10/86 (11.6%) | 12/89 (13.5%) |
| 20261007 | 1/39 (2.6%) | 3/56 (5.4%) | 12/81 (14.8%) | 17/94 (18.1%) | 16/87 (18.4%) |

| Seed | 300–360 | 360–420 | 420–480 | 480–540 | 540–600 |
|---|---|---|---|---|---|
| 20261005 | 17/90 (18.9%) | 18/88 (20.5%) | 20/83 (24.1%) | 22/81 (27.2%) | 22/86 (25.6%) |
| 20261006 | 15/86 (17.4%) | 20/86 (23.3%) | 15/83 (18.1%) | 14/87 (16.1%) | 19/86 (22.1%) |
| 20261007 | 19/85 (22.4%) | 16/90 (17.8%) | 20/83 (24.1%) | 19/87 (21.8%) | 14/88 (15.9%) |

Support is absent or below 10% during the first one or two windows, but each seed has available events in 9–10 of 10 windows. This is recurring support, not continuous availability.

## Scheduling, placement, blocked calls, and retries

The initial accepted spawn is shown separately. Scheduled opportunities below are due calls and include retry opportunities. A blocked call exhausted all 12 placement attempts. Clearance-rejected positions are individual failed candidates.

| Seed | Accepted total | Initial | Non-retry due | Retry due | Blocked calls | Retry calls that accepted | Position attempts | Clearance rejects | Retry pending at 600 s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20261005 | 769 | 1 | 768 | 16 | 16 | 11 | 1,719 | 950 | No |
| 20261006 | 819 | 1 | 818 | 12 | 12 | 10 | 1,754 | 935 | No |
| 20261007 | 790 | 1 | 789 | 11 | 11 | 9 | 1,587 | 797 | No |

Total due scheduled opportunities, including retries, were 784, 830, and 800. Successful placement positions equal position attempts minus clearance rejects for each seed. No call was suppressed by the recruitment ceiling.

## Research interpretation

The actual completed local outgoing-flow signal meets the authored recurrence screen at accepted spawn moments: 15.51–17.95% availability and 9–10 supported windows per seed. Where it exists, q is numerically directional rather than nearly isotropic: median R is 0.808–0.838 and median diagnostic w is 0.748–0.845 rad, compared with π for isotropic fallback.

Available q directions are tightly concentrated around north in all three seeds. This is an observation of the current north-biased production history, not evidence that q is independent of that spawn law or supplies a new direction. Recurrence gate passage justifies the specified candidate comparison; it does not show that flow-conditioned recruitment is useful or artistically better.

No claim follows about entrance position, biological recruitment, long-run regime turnover, material saturation, Chemical Residence interaction, or production adoption. Fixed spawn position remains untested.

## Exact next comparison authorized by GO

- CONTROL: isotropic accepted-spawn heading.
- TREATMENT: outgoing-flow q when available; isotropic fallback otherwise.
- Keep position, cadence, population, movement, and material laws unchanged.

No north-biased arm is required to rediscover the prior founder responsibility. No pheromoneDirect / pheromoneSlow rerun. This candidate comparison is not part of this pass.

## Provenance and validation

- Branch: codex/ant-recruitment-outgoing-flow-availability-20261031, created at the exact authority commit above.
- Observer code: scripts/ant-recruitment-outgoing-flow-availability.js.
- Protocol: PROTOCOL.md; raw event rows, summaries, source lock, and parity receipt: analysis/.
- Prior heading responsibility and the unexecuted flow-family proposal remain historical in the [2026-10-22 founder survey](../2026-10-22-recruitment-founder-survey/REPORT.md). Its 1 Hz percentage is not transferred here.
- The runner passed Node syntax check, locked-source assertions, signal self-checks, three natural 600 s histories, seed 20261005 parity, and event-row readback validation.
- Source/artifact hashes are recorded in SOURCE-HASHES.json and SHA256-MANIFEST.json.
