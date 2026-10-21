# Long-run exhibition feasibility

**Decision: E — a complete long-run exhibition configuration is not yet ready.** Two-resident physical audio is a promising technical prototype, but the integrated headed run was stopped at the user's request after **1,080.296 s (18:00.296)**, not two hours. The artist also judged the latest-8 visual preview still too similar. Further investigation was explicitly stopped; this package records the verified scope and preserves unfinished work.

## Scope and evidence

This pass asks whether ANT can sustain visible material change and live sound over long exhibition durations. It separates natural visual/material history, audio compute feasibility, and integrated browser uptime because they use different clocks and conditions. The long visual captures are deterministic accelerated model runs; the audio captures are offline renders; only the soak exercises the integrated browser and audio worklet.

Raw captures and reproduction inputs remain alongside this report. Visual evidence is under [`visual/`](visual/) and [`visual-capacity-1024/`](visual-capacity-1024/); offline audio measurements and input receipts are under [`audio/`](audio/); integrated runtime records are under [`runtime/`](runtime/). The capture source baseline is `aea6601f6fc5c4d241fae7376f0f6cd59d11101f` unless a run manifest says otherwise.

## Implementation facts and candidate selection

`?antResidents=2` selects an immutable acoustic responsibility at startup. The newest two Plates, by full material birth order, retain the existing Plate solver and internal Z adjacency. Surviving Plate identities retain their vibration, quiet-step, contact pulse and recovery state across topology installation. New Plates start with zero solver state, as in the existing installation path. Retired acoustic states leave the worklet; their material descriptors and stratigraphic/locomotion consequences remain in the world. There is no world reset, historical-contact replay, mode switch during execution, generic ambient sound or random strike dropping.

The audio subset is a **global suffix**, rather than a changing selection of loud or recently contacted surfaces. This has a useful causal property: if any resident covers a source cell, its latest resident is also that cell's full-world top. If no resident covers it, the audio route is silent. The bridge still explicitly projects the full-world top map and uses full-world exposed-contact normalization, so omission does not redirect a foot to old buried material or renormalize the other feet upward. Noncontiguous exposed/contact-selected subsets would require additional care to preserve original adjacency and routing; they were not implemented.

Acoustic loss is substantial and explicit. Nonresident pickups, continuing vibration, old direct contacts, and Z links crossing the cohort boundary are absent. Foundation Spheres are retained only when their actual foundation Plate is resident. **Every tested mature one/two-Plate cohort contained zero Spheres**, although the full world retained up to 32 Nodules; the natural foundation IDs were early historical Plates. The UI describes Sphere support as a capability, not an observed contributor in these runs. This mode reads actual physical material responses from a bounded foreground; it is not physically equivalent to the Full world.

One resident was the smallest screening candidate; two were selected for integrated testing because they preserve an actual inter-Plate Z connection while retaining ample offline headroom. This is not a search for a preferred timbre. No Z-off/residency combination, loudness threshold, random stealing, gate sweep, new engine or GPU solver was adopted. Earlier exact force-cache/dense-Lap and refractory results remain separate in the [previous audio feasibility package](../2026-10-21-exhibition-audio-runtime/README.md).

`?antVisual=recent` is a separate immutable presentation option. The existing per-revision material image replaces only true exposed top cells in the latest eight birth-order layers with `(194,112,39,64)` RGBA; all other material pixels retain baseline gray. There is no age fade or continuously timed opacity change. Production Full and the baseline renderer remain defaults. The previous comparison's `latest8-top` is a **separate overlay recipe**, with alpha 0.30 above the baseline scene; it is not pixel-equivalent to the implemented under-pheromone image. The exact built-in still-comparison helper was prepared but not run before research stopped. Neither recipe is treated as an accepted artistic solution.

## Visual/material history

The baseline visual capture used seed `20261005`, default production laws, audio Off, and the production history cap of 256. It reached its first 256-Plate cap at simulation time **3,814.783 s (63:34.783)**, then ran to 7,200 s. At the final snapshot it still had 256 retained Plates, zero births in the last minute, zero new union coverage, and zero exposed/buried turnover for that minute. The union footprint was 7,128 cells. This is evidence of material accumulation followed by a static capped state, not continuing visible change after saturation.

The user’s direct visual assessment of the baseline was that it needs **more continuous material change**. That is a perceptual/design judgment, not a metric inferred from the capture.

An approved shadow run raised only the instance history/storage ceilings to 1,024 before tick 0. Qualification, behavior, and RNG laws stayed unchanged; the override was not applied to production. The run reached **474 Plates in 7,200 simulation seconds**. Complete serialized public world snapshots at 0, 60, 300, 900, 1,800, and 3,600 s are byte-identical to the default-cap run. This is equality at six checkpoints, not an every-tick comparison or equality of private controller/RNG state. It does not establish parity after the default run is capped and the shadow continues forming material.

The shadow’s final minute formed three Plates; 2,531 cells had a different top identity than at the preceding minute checkpoint, while the union footprint grew by zero cells. This is a sampled cell difference, not a count of every within-minute replacement. Thus the observed late activity is predominantly turnover over already-covered territory, not expansion into new area. The distinction matters: turnover is a measured material-history change, while whether it reads as sufficiently continuous or visible remains a human judgment. A separate “latest 8” research preview exists and is discussed below; it has not been accepted as a visual solution.

| Simulated time | Shadow Plates | Material union cells | Latest-8 exposed top cells | Cells with buried material |
| ---: | ---: | ---: | ---: | ---: |
| 15 min | 49 | 6,786 | 3,701 | 6,507 |
| 30 min | 110 | 6,999 | 3,778 | 6,792 |
| 60 min | 237 | 7,128 | 4,387 | 6,932 |
| 120 min | 474 | 7,163 | 3,485 | 6,989 |

These are 96×96 source-grid counts, not rendered pixels or a novelty score. Exposed tops and buried material may occur at the same spatial cell. Total buried **layer-cell incidences** at 120 min are 686,970; that is a sum over retained layers, not 686,970 unique world cells. The union adds only 377 cells after 15 min despite another 425 Plates. This is a strong counterexample to treating continued birth or a higher cap as continued macro-silhouette evolution. It supports a formation/coverage limitation alongside a renderer limitation. The shadow's six checkpoint and first-256-descriptor equality checks do not justify claiming identical post-cap movement: additional real layers legitimately affect the unchanged retained-material locomotion law.

## Audio compute measurements

The resident-input captures are fixed offline workloads derived from a natural 30-Plate capture. Each benchmark renders 12 s of audio (576,000 frames) in Chrome `OfflineAudioContext`; throughput is rendered audio seconds divided by measured wall seconds. Values below are not live-world clocks or tests of venue output.

| Historical Plate count | Previous Full | Previous Z-off | One resident | Two residents |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 0.954× | 1.496× | 10.210× | 5.260× |
| 20 | 0.285× | 0.486× | 11.310× | 5.197× |
| 30 | 0.173× | 0.289× | 11.060× | 5.221× |

Both resident counts complete all three 12 s workloads faster than real time. Adding a second resident materially lowers throughput in these captures. This supports offline compute feasibility for these bounded inputs only. It does not establish continuous AudioWorklet scheduling or stable performance over hours. The resident policy also omits nonresident strike routes by construction; input receipts preserve omitted/retained counts. It is an audio prototype behavior, not a transparent full-history playback of all material.

The original topology/seed/window and already-normalized natural strike payloads are reused. Two residents retain 753/1,401 (53.7%), 712/1,698 (41.9%) and 661/2,056 (32.1%) strikes at 8/20/30 historical Plates; one retains 45.5%, 33.6% and 24.5%. This is selection by actual material identity, not a fixed event-rate cap. Two residents contain 559/557/573 solver nodes and 182/206/167 Z links. They remained awake in these continuously excited windows; the speed gain comes from bounded responsibility, not improved Sleep. Coarse 1 ms worklet instrumentation sums 2,263/2,286/2,282 ms across 4,500 blocks, while full offline wall measurement is 2,281.5/2,309.0/2,298.2 ms. The timing instrumentation's block maxima are quantized, not a precise callback-deadline or hard realtime proof.

At the 30-Plate window, fixed-gain RMS/peak are 0.013409/0.080692 for one resident and 0.015904/0.082068 for two. All offline samples are finite, with zero recorded drops/clips. Lower RMS is an acoustic consequence, not evidence of performance or improved clarity. Review the [unaltered fixed-gain clips](audio/listening.html); no loudness normalization or human listening result is claimed.

### Controlled acoustic turnover

The [turnover input receipt](audio/turnover/turnover-inputs-receipt.json) reconstructs a single natural 8→9 Plate transition from captured strike timing and immutable descriptors. The two conditions share resident Plates 7/8 before the boundary. At frame 480,000 (10 s of a 12 s, 48 kHz replay), the candidate becomes 8/9 and a no-retirement control becomes 7/8/9. All 1,503 original natural events retain their order and amplitudes before deterministic material routing; 841 versus 855 strikes are routed. The inferred topology revision, rounded install frame and controller-order assumption are labeled in the receipt; no strike is tied to the install frame.

PCM is bit-exact through frame 479,999, with the first different frame at 480,007. Plate 7 had nonzero vibration at installation (solver-unit state proxy 0.000176625), so retirement is not lossless. The candidate and control have RMS 0.02530/0.02536 and equal peak 0.12827; neither drops, clips or creates nonfinite samples. The measured install-edge adjacent delta 0.00039919 is below the preceding 500 ms maximum 0.00106665, but that is **not** proof of an inaudible click. This cold replay, with zero resident Spheres, tests a narrow state/PCM boundary; it is not a live warm-history installation or human listening test. No fade was added to hide the loss.

The previous exhibition-audio pass remains the full-history reference: mature 20–30 Plate Full and Z-off operation fell below realtime. This pass also found a separate **main-thread scheduling slowdown with two acoustic residents**, not a recurrence of the full-history solver collapse. In the interrupted 600.275 s native-scheduling attempt (`runtime/soak-2026-10-21T04-00-44-558Z`), cumulative simulation/wall was **0.644316** and audio/wall **0.999973**. After approximately 390 s, rAF fell toward 1 Hz while the page still reported visible/focused. The controller's existing 100 ms frame-gap clamp then limited simulation advancement. The cause remains unresolved; concurrent work and browser scheduling are not isolated. The raw heartbeat's `running` value is its last flush, not a completion record. See its external-stop receipt. A separate protected profile was used for the integrated measurement below; it demonstrates that recorded operating condition, not that the unresolved native-profile slowdown was fixed.

## Integrated Chrome measurement

The selected recorded run is [`runtime/soak-2026-10-21T04-31-03-679Z/`](runtime/soak-2026-10-21T04-31-03-679Z/). It used installed headed Chrome **155.0.8059.85**, Windows `10.0.19045`, Intel **i5-13600KF**, 20 logical processors and 68,537,929,728 physical-memory bytes. The page viewport was 1440×1100, with a 640×640 ANT canvas at DPR 1. The startup configuration was `?antResidents=2&antVisual=recent`, with the **approved harness-only 1,024 storage shadow**, seed `20261005` and the protected scheduling flags recorded in `run.json`. Full source and served-build hashes are recorded. Chrome's actual command line had no mute-audio flag; OS/device output was not observed. Offline clips are explicitly 48 kHz; the live harness did not separately record the AudioContext sample rate, so it is not inferred from those clips.

Audio-Off natural pre-growth took 30,961 fixed ticks and about 5.993 wall seconds, reaching 30 Plates. The measured real-time window then started at 516.667 simulated seconds with Audio On. It ran **1,080.296 wall seconds**, through 36 sampled windows, and was gracefully stopped on the user's instruction to perform no further investigation. Both end record and heartbeat say **`interrupted`**, with the user stop reason and a final world checkpoint. This is not completion of the requested 7,200 s.

| Measured item | Result / boundary |
| --- | --- |
| Historical material | 30→112 Plates; no material retired from the world |
| Acoustic residents | 2 throughout; sampled active nodes 431–683, final 611 |
| Internal Z links | 152–263 sampled; final 211 |
| Spheres | 32 historical, zero residents / live modes |
| Last sampled duration | 1,080.2798 s; end followed 0.0164 s later |
| Cumulative simulation/wall | 0.99994156; final sampled simulation lag +63.13 ms |
| Cumulative audio/wall | 0.99999278; final sampled audio lag +7.80 ms |
| Sampled audio lag range | +1.00 to +10.03 ms; no monotonic runaway lag in this window |
| rAF callback rate | 59.33–60.02 Hz across sampled windows |
| JS heap used | 27.45–74.53 MiB sampled; this is not total browser/OS memory or a long-run bound |
| Topology compilation | 137 calls including pre-growth, 169.6 ms aggregate, 3.8 ms maximum |
| Processor topology installs | 83 after Audio On, including initial topology and births |
| Sleep / wakes | 0 sleeps; 45,749 node activation counts accumulated across strikes/topology changes |
| PCM observations | 36 sampled 2048-frame windows; RMS 0.003493–0.028183, maximum sampled peak 0.063017 |
| Errors / drops / nonfinite / clips | Zero recorded processor/bridge errors, drops, nonfinite and clip counters |

The first measured bridge-counter baseline is at 30.271 s, so the directly subtractable routing window is **1,050.0088 s**, not the full 18 minutes. It contains 72,995 delivered strike routes and 106,627 omitted feet on nonresident true top material, plus 7,863 feet with no full-world material support. Of the measured material-supported routes, 40.64% were delivered. This is material selection, not a preselected drop rate or density target. First cumulative counters also include pre-growth and are not mislabeled as measured-only totals.

The sampled cumulative processor pre-output maximum was 0.26749. The post-gain analyser windows are sparse observations, not continuous audio recording or proof that every output sample was unclipped. The raw processor clip/nonfinite/drop counters remained zero. No human listening, DAC audibility or transition-quality judgment was performed. The bounded residents remained awake; the result does not solve Full-world Sleep persistence.

Receipt-hashed world checkpoints at measured 0, 900 and final elapsed time preserve all 30 initial immutable Plate descriptors and their layer-order prefix exactly, with monotonically advancing simulation time and retained counts. This verifies sampled public state continuity without claiming private RNG-state or every-tick equality. Source world laws were not modified. The checkpoint serializer/gzip observer can affect nearby main-thread cadence; its individual serialization/compression cost was not separately timed. CDP DOM node allocations varied from 376 to 5,126; detached/live-node interpretation and long-run growth were not resolved before the stop.

The [analysis summary](runtime/soak-2026-10-21T04-31-03-679Z/analysis/summary.json), [sample CSV](runtime/soak-2026-10-21T04-31-03-679Z/analysis/samples.csv) and [fixed-axis plot](runtime/soak-2026-10-21T04-31-03-679Z/analysis/soak-summary.svg) retain clock offsets and sampling boundaries. The protected launch is an operating condition, not proof that the earlier slowdown's cause was fixed. The earlier 04:22 protected run was separately stopped after 395.3 s to install the startup visual readout; the 04:00 native-scheduling attempt lacks a graceful final checkpoint and remains a negative result. Neither is combined with this run to manufacture a two-hour duration.

The latest-8 top-material time-series readout exists as a minimal research preview, not an accepted visual solution. The user’s response was: **“여전히 비슷해보이는데 개미 생성 위치랑 처음 향하는 방향이 고정이라 비슷하게 나오는건가”** (“It still looks similar; could it be because the ant spawn position and initial heading are fixed?”). This records perceived similarity and a hypothesis, not art success or established causation. The current controller uses spawn center `(0.5, 0.72)`, radius `0.018`, and initial heading `−π/2 ± 0.3`; Plate formation samples the same-origin annulus and selects a source-to-boundary branch. Those shared spatial anchors plausibly contribute to repeated macro-composition, but this capture does not isolate that cause. No movement or formation change is authorized by this evidence.

## Claim boundaries and current decision

**Implemented facts:** the production history cap remains 256; the visual shadow’s 1,024 cap is a per-instance capture override; the resident audio prototype schedules a bounded subset of recent Plates; the full-history audio path remains the default. The visual and resident prototypes do not imply adoption of new world laws.

**Measured observations:** the default visual run saturates at 256; the 1,024 shadow reaches 474 and continues top-cell turnover mostly within its existing union; six public shadow checkpoints exactly match baseline; offline resident renders complete at the recorded throughput. The final integrated run supports 18 minutes at 30→112 historical Plates under its recorded protected launch condition. It does not include a completed two-hour soak.

**Perceptual/design judgment:** the baseline needs more continuous material change, and the current latest-8 preview still looks similar to the user. The available turnover and coverage counts do not decide whether the shadow’s late changes are legible or satisfying on the exhibition display.

**Design interpretation:** persistent material history can be retained while a bounded acoustic foreground is read by the original physical solver. This is an exhibition presentation policy with audible/modeling loss, not a production physical law. Raising a finite storage cap restores some real layering but does not resolve repeated macro-composition. Fixed entry position/heading, source-to-boundary formation and spatial saturation are competing explanations; they were not isolated by intervention.

**Open hypotheses / unverified:** a two-hour or longer integrated run; other seeds and larger resident geometry; cold Audio-On start with early Sphere formation; late material/DOM/memory behavior; native-profile slowdown cause; venue display size, audio device and human listening. The exact built-in readout still comparison was prepared but not run after the user stopped further research; the earlier overlay comparison must not be substituted for that result. No source location/direction, movement, formation, qualification, pheromone, material mapping, history deletion or RNG mechanism was tuned.

## Exhibition decision and handoff

- **A Full:** rejected as an operational recommendation by the previous mature runtime evidence; this pass does not repair its solver gap.
- **B Existing Lite:** also below mature realtime in the previous actual Chrome evidence.
- **C New bounded audio:** technically promising; real physical Plate responses with internal Z were sustained for the measured 18 minutes. It remains a research prototype, with omitted historical vibration/Spheres and no hours-long or perceptual acceptance.
- **D Audio Off + readout:** conservative operational fallback only. Prefer Audio Off with the **current renderer** for a rehearsal if sound must be disabled. This does not satisfy the artist's requested long-run material-form evolution; the amber alternative is not accepted as better.
- **E Not ready:** **primary decision for the stated submission goal**, because visible macro-form evolution is insufficient under the reviewed preview and hours-long operation was not completed. A renderer tint or cap increase is not presented as a solution to that gap.

Use [OPERATOR.md](OPERATOR.md) for startup, losses and the explicit storage-shadow boundary. The default startup retains Full and the production 256 history cap. No 1,024 production adoption, PR, merge or force-push is included. A meaningful later pass would first settle the intended formation/entry/world evolution contract and its falsifiable comparison; changing spawn direction alone is not established as a solution. Rehearsal of the bounded audio on the actual venue device and an uninterrupted long soak remain separate work, not automatic follow-ups.
