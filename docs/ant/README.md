# ANT — Current Architecture, Evidence and Research Boundary

**Current repository state: 2026-10-11**

이 문서는 ANT의 **현재 verified state**를 위한 GitHub-side hub다. 과정은 [daily logs](daily/README.md), 실험별 원본과 재현 자료는 [evidence packages](evidence/)에 둔다.

## Current status

```text
equal ants
→ pheromone
→ FOOT_CONTACT
→ SurfaceField
→ TrailPlateBirth
→ MaterialStratigraphy
→ Plate / Z / buried Sphere
→ physical vibration / audio

current/recent proximity
→ DynamicSocialGraph
→ TemporalSocialTopology
(read-only)
```

현재 production behavior baseline은 founder refinement commit `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9` 이후 동결되어 있다.

S0/S1 read-only social observation pass의 구현/evidence 흐름:

```text
8076de6  Add read-only ANT dynamic social graph
a6801d6  Add temporal social topology analysis
f4365b1  Add ANT social graph evidence harness
af9c417  Record ANT social graph baseline evidence
```

그 이후 커밋은 daily/documentation을 추가할 수 있으므로 **repository HEAD와 latest implementation baseline을 구분**한다.

### Latest W1 Endogenous Formation — Contribution and physical extent remain unselected

The [Contribution & Spatial Extent design](w1-endogenous-formation-contribution-spatial-extent-design.md) finds that current birth is already computationally endogenous, while its conversion/configuration yield, layer partition and repeat commitments remain authored rather than identified by the evidence. Contact dose is environmental memory, not material amount; spatial union does not determine physical layer identity. Plate-native generation is operationally possible without an independent Material field, but no endogenous law is selected. Existing Plate/Z retention-response and derived Deposit are retained. **W1 remains Undecided / Research Gap.** No new experiment or evidence package is created. [Chronology, independent review and verification](daily/2026-10-11-w1-endogenous-formation-contribution-spatial-extent.md).

### Completed W1 Formation / Retention / Response — Supplied-layer attribution supported; endogenous gap remains

The [Plate-native contract](w1-plate-native-formation-retention-response-contract.md) and [controlled response-attribution audit](evidence/2026-10-11-w1-supplied-layer-response-attribution/README.md) show that, in the fixed all-rest normalized-solver fixture, the first inherited-node Float32 differences are compatible with and reproduced by the added local Z-link update terms. State/pulse matching, reinstall, no-probe, disjoint-layer, and deterministic-replay controls pass. This attributes the supplied-layer response inside the existing authored solver only; it does not establish ANT formation, physical deposition work, supply generation, or organism consequence. The earlier [bounded feasibility probe](evidence/2026-10-11-w1-supplied-layer-response-feasibility/README.md) remains preserved. **W1 remains Undecided / Research Gap.** [Chronology](daily/2026-10-11-w1-supplied-layer-response-attribution.md).

### Prior W1 architecture reassessment — Physical Plate/Z retained, formation unresolved

The [2026-10-11 reassessment](w1-formation-plate-deposit-reassessment.md) retains Plate as a physical deposited layer and Z stratigraphy as its changing present relations. It distinguishes field/geometry/scheduler qualification from independently identified formation, keeps Deposit derived without adding an identity or lifecycle, and preserves all negative/mixed W1 results. Plate-native and field-first formation remain competing possibilities; neither is adopted. Its frozen-archive repeat-birth contact-locality proposal is complete: all five source-matched actual repeats had at least 30 post-baseline contacts in both the matched prior mask and the new frozen mask. This supports only the bounded locality observation; it adds no material mechanism, and W1 remains **Undecided / Research Gap**. [Decision and alternatives](w1-formation-plate-deposit-reassessment.md) · [Audit evidence](evidence/2026-10-11-w1-repeat-birth-contact-locality-audit/README.md) · [Chronology](daily/2026-10-11-w1-repeat-birth-contact-locality-audit.md).

### W1 material response design — Standalone witness, ontology unresolved

The [2026-10-11 response design](w1-material-response-discrimination-design.md) retains reference extension `p` only as a standalone elastic–perfectly-plastic witness, using matched environmental inputs and displacement forcing with reset, frozen-state and subyield controls. A follow-up source audit confirms that gait strength is an ant-ID-derived parameter and SurfaceField ignores it, applying contact dose rather than solving force or deformation. Existing audio excitation is modeled, not measured foot loading. A joint loading/constitutive compatibility contract is required before selecting an ANT mechanism; defining a proxy alone is insufficient. No mechanism or response experiment is implemented. W1 remains **Undecided / Research Gap**, and existing production material/audio and frozen evidence are preserved. [Design, compatibility correction and executable specification](w1-material-response-discrimination-design.md) · [Chronology](daily/2026-10-11-w1-material-response-discrimination-design.md).

### W1 material formation design gate — Undecided / Research Gap

The [2026-10-10 design gate](w1-material-formation-design-gate.md) separates historical record, activity, environmental memory, material contribution and birth. Existing SurfaceField retention is explained by its production updates; the archives do not identify an independent W1 formation process. Episode closure and activity connectivity are not sufficient formation criteria. The archived chemical-input sufficiency preflight verified input descriptors and update-clock coverage, then stopped before recurrence because the archived replay-runner hash differs from every recovered runner candidate. Source inspection confirms that the committed `b9e0896` runner captures the chemical grid and post-update memory after the same `TrailPlateBirth.advance` call, but the manifest's disk hash is read after ESM loading and cannot bind those bytes to the archived execution. Sufficiency remains **inconclusive / blocked**; the W1 decision remains **Undecided / Research Gap**. Production `TrailPlateBirth`/stratigraphy remain implemented, and W2/vitality/feedback/audio stay gated. [Design gate](w1-material-formation-design-gate.md) · [Sufficiency evidence](evidence/2026-10-10-w1-chemical-input-sufficiency-audit/README.md) · [Runner provenance evidence](evidence/2026-10-10-w1-archived-replay-runner-provenance-recovery/README.md) · [Chronology](daily/2026-10-10-w1-archived-replay-runner-provenance-recovery.md).

### Latest W1 archive recurrence check — Consistent, provenance unresolved

The frozen `chemical` snapshots reproduce all `16,561,152` archived `chemicalMemory` Float32 values byte-for-byte under the current production sampler and recurrence. This establishes archive-internal numerical consistency only: the original runner hash still does not match, same-update capture timing remains unverified, and the earlier sufficiency result stays **Inconclusive / Blocked**. W1 remains **Undecided / Research Gap**. [Evidence and hashes](evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check/README.md) · [Chronology](daily/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check.md).

### W1 spatiotemporal local-coherence audit — Mixed

The read-only graph connects eligible per-cell spells only when distinct 8-neighbor cells shared an observed `q === 1 && active === 1` frame. It preserves the three frozen seeds, all `1,797` matched q/EMA/active frames, and existing W1/max-overlap outputs. The old same-frame events are substantially joined, but each seed also grows a giant component containing 94.0–96.8% of eligible spells; single-cell groups persist, and unique-cell area is unchanged from the dense local union. This is retrospective activity history, not material formation evidence. [Evidence and fixed-scale plots](evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit/README.md) · [Chronology](daily/2026-10-09-w1-spatiotemporal-local-coherence-audit.md).

## Architecture

### Agent / movement

- 모든 ant는 동일한 `AntAgent`.
- leader, caste, pioneer role/state 없음.
- inertia / acceleration / braking / bounded turn.
- local occupancy와 swept collision constraint.
- 자연 퇴장 + gradual recruitment.
- behavior는 framework-independent model에 있고 renderer는 snapshot만 그린다.

### Chemical memory

`PheromoneField`는 shared environmental memory다.

- 96×96 grid
- 15 s half-life
- gaster rear에서 실제 이동 거리 기반 deposition
- short-range evidence 기반 `trailAdherence`
- founder refinement는 low-evidence 새 commitment와 baseline deposition만 약하게 낮춤

Founder pass 이후 behavior를 더 튜닝해서 branch/procession을 만들지 않는다.

### Mechanical memory

실제 six-leg tripod gait가 `FOOT_CONTACT`를 만들고, 이 이벤트가:

```text
gait
→ FOOT_CONTACT
→ SurfaceField
→ Plate qualification
→ material/audio excitation
```

의 공통 입력이 된다.

`SurfaceField`는 느린 mechanical compaction memory다. gait와 SurfaceField는 social observer 때문에 변경되지 않았다.

### Frozen material history

`TrailPlateBirth`는 persistent chemical + mechanical corridor만 immutable Plate descriptor로 만든다.

`MaterialStratigraphy`가 이후 overlap에 따른 exposed/buried/depth를 관리한다.

핵심 invariant:

- birth 후 geometry/material은 frozen
- age ≠ depth
- later overlap만 burial을 만든다
- direct foot strike는 exposed top material 하나에만 전달
- buried material은 reciprocal coupling으로만 반응
- technical ceiling은 history eviction semantics가 아님

### Physical audio

현재 production sonic baseline:

```text
3 ms finite direct-contact pulse
75 ms local mechanical recovery
×50 Plate damping
```

Plate history는 장기 저장되지만 vibration memory는 짧게 둔다.

Optional audio-only base substrate tooling/evidence is now integrated on `main` via PR #1, but the feature default remains **Off**. Frozen P1 calibration compared B `.025`, C `.010`, and D `.015` with identical input, P1 descriptor, 63 accepted strikes, 44 matched parent groups and playback/analysis windows. D's first-birth 10 s all-event substrate RMS is **4.72 dB below** born-only P1 (C: −8.24 dB, B: −0.29 dB); pre-birth Off is exact silence and On is nonzero. Shared +18/+20 dB post-gain exports preserved the P1/substrate balance while making the stems directly audible and the fixed-scale plots easier to read.

The later listening judgment is **subjective/artistic, not a numeric acceptance rule**: at an audible absolute level Candidate D felt too dominant, and the current substrate character read as too metallic with too much resonant decay. Therefore `.015` is retained as calibration evidence, not an adopted production balance. The next audio side-pass should isolate timbre/material character first—toward a duller, sand-like, granular/noisy response with shorter ringing—before any final ratio calibration. No biological claim is attached to that timbral direction. [Candidate D PCM·fixed-scale evidence](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md) · [Candidate C `.010`](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.010/README.md) · [Candidate B `.025`](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.025/README.md) · [shared +18/+20 dB evidence](evidence/2026-10-08-candidate-d-absolute-level/README.md).

Frozen P1 pickup-distance diagnosis found a clear midpoint drop but a far-branch counterexample; this supports pickup locality without establishing a monotonic distance law. No candidate topology was tested. [거리/RMS 상관과 동일 세기 위치별 PCM](evidence/2026-10-07-base-substrate-debug/audio/pickup-distance-readout/README.md).

The full 48-node P1 map found strong channel-matched distance response plus nearby low-output and similarly distant high-output regions. One fixed sigma-1 Gaussian 1-hop aperture was tested and rejected: pooled P10 fell 23–25% across 100–500 ms windows. Production point pickups remain unchanged. [fixed-scale node map](evidence/2026-10-07-base-substrate-debug/audio/p1-node-observability/README.md) · [aperture A/B](evidence/2026-10-07-base-substrate-debug/audio/p1-pickup-aperture-ab/README.md).

mature 20–30 Plate의 AudioWorklet realtime collapse는 unresolved known issue다. Audio/runtime, sleep/wake, ROM optimization은 현재 연구 본선에서 보류한다.

### Read-only social observation

`DynamicSocialGraph`:

- caller가 fixed tick 뒤 복사한 `id/x/y/radius`만 읽음
- undirected body-scale proximity episodes
- stable IDs, start/end, duration, min distance
- 60 Hz raw observation
- no RNG, no callback into behavior, no controller/renderer auto integration

`TemporalSocialTopology`:

- 20 Hz analysis
- windows: 0.25 / 1 / 5 / 20 s
- active isolates 포함
- weighted edge = window 안 cumulative proximity seconds
- component / merge / split / edge lifetime
- persistent bridge / articulation / retrospective connector events
- recent-edge tail과 current encounter를 분리

## Latest S0/S1 result

Encounter observable:

```text
q(A,B) = distance(A,B) / (radiusA + radiusB)
q ≤ k
k = 1, 1.25, 1.5, 2
```

기본 radius 0.006에서 center-distance threshold는 0.012 / 0.015 / 0.018 / 0.024다. 이는 collision/body-scale proximity proxy이며 literal antenna/head contact가 아니다.

세 matched seeds(20261005/06/07), 각 600 s에서 graph OFF/ON을 비교했다.

- 108,000 matched simulation ticks
- trajectory/RNG/pheromone/SurfaceField/FOOT_CONTACT/lifecycle/birth hashes match
- focused 120 s pass는 gait/body pose/gaster/activation/stratigraphy/audio command까지 매 tick deep-compare
- final full tests 261/261
- Chrome dev + production preview smoke pass

자연 topology는 sparse했다.

| Window | 해석 |
| --- | --- |
| 0.25 s | current transient를 가장 잘 드러냄 |
| 1 s | primary recent-proximity observation window |
| 5 s | accumulated recent context |
| 20 s | memory/turnover sensitivity case |

k=2 / 0.25 s connector는 총 11건, 0.30–0.65 s였다. 전부 recruitment origin `(0.5, 0.72)`에서 0.019 이내였고, 1 s 이상 window에서는 connector PERSIST가 0이었다.

또한 1 s component count와 population correlation은 seed별 0.953–0.959였다. 이는 기술통계이며 유의성이나 causal null test가 아니다.

**현재 해석:** persistent pioneer/social organization은 미입증이다. 관찰 결과는 proximity, recruitment density, movement geometry, window memory로 설명 가능한지 먼저 검증해야 한다.

전체 수치와 raw archive: [2026-10-07 social graph evidence](evidence/2026-10-07-social-graph/README.md).

## S2a first synchrony null — 2026-10-08

Replayed the existing three 600 s archives with 32 deterministic per-ant circular whole-tuple phase shifts per seed. At k=2 / 1 s, original mean edge counts (1.07–1.24) were below every within-seed null value (null means 2.69–3.02); original short connector counts overlapped null variation. Every rotation preserved the archived ID/lifecycle mask and individual tuple sequence, and all source archives remained byte-identical.

The comparator moves birth/recruitment-origin alignment and introduces discontinuous circular seams; approximately 54–57% of null raw episodes were seam-flagged. It does not preserve instantaneous colony density or collision exclusion. S2a is complete as a first synchrony test, while full movement-constrained validation and social organization remain unestablished. [Method, limitations and seed-level evidence](evidence/2026-10-08-s2a-null/README.md).

## S2b exact spatial movie and S2c predictive value — 2026-10-08

S2b completed eight deterministic five-second identity permutations per seed while preserving every instantaneous spatial configuration. Most simple recent-graph changes concentrated around intentional remaps and lifecycle repairs; this identity/data-stream null did not isolate social continuity from artificial boundaries. [S2b evidence and limitations](evidence/2026-10-08-s2b-null/README.md).

S2c used only the three natural archives to predict an existing k=2 / 1 s component merge in the next second. Leave-one-seed-out logistic models compared five current spatial/movement features with three additional causal graph summaries. Future-merge prevalence was 30–32%. Primary added-minus-baseline ROC AUC was +0.002855 / −0.025544 / −0.008080; average precision and Brier likewise improved seed 05 slightly and worsened seeds 06/07. A training alignment control also produced small gains. **Decision: spectral SKIP at this gate; no consistent held-out additional-value signal.** This concerns the selected features/model, not all possible temporal information or social organization. [S2c definitions, leakage audit, results and reproduction](evidence/2026-10-08-s2c-incremental-value/README.md).

## Social observation vs material generation

### Social observation

```text
fast
mobile
ephemeral
current/recent proximity-derived
read-only / parked baseline
```

S0–S2c 결과에서 현재 social topology를 독립적인 생성 원인이나 causal layer로 올릴 근거는 확인되지 않았다. 따라서 social graph는 버리지 않고 **현재 movement system을 읽는 frozen diagnostic baseline**으로 유지한다.

향후 explicit relationship / partner memory / social mechanism을 별도 가설로 도입할 경우, 이 no-relationship baseline과 matched seed / observer semantics로 다시 비교한다. 그때 차이가 재현될 때에만 social mechanism의 추가 효과를 논의한다.

### Material generation

```text
movement
→ chemical memory
→ FOOT_CONTACT / mechanical memory
→ frozen Plate / stratigraphy
→ physical vibration / sound
```

이 축은 현재 구현과 evidence가 직접 연결되는 생성계다. 현재 프로젝트의 중심 질문은 social topology를 material의 원인으로 가정하는 대신:

> 현재 행동이 사라진 뒤에도 반복 행동의 역사가 환경의 물질 구조와 소리로 남는가?

로 둔다.

## Persistent-world design target

The verified production chain above remains unchanged, but the long-term architecture is now defined as a **persistent circulating world** rather than a one-way agent→material→sound pipeline.

```text
internal state
→ action
→ environmental memory
→ material
→ vibration
→ shared environmental condition
→ internal state / action
```

There is no prescribed destination or global reward in this design. Agent presence is not the existence condition of the world: zero-ant intervals are valid and slower world state may continue. Future state/feedback links should alter local possibilities and consequences rather than command routes. Internal state is not directly sonified; the world itself is the target sounding body; any future acoustic feedback must derive from pre-master physical vibration rather than speaker/master output. Exceptional entities may occur, but their influence must remain finite and bounded.

The full design contract, implemented-vs-proposed boundary and staged plan are in [`world-model.md`](world-model.md). Current production remains frozen until each new causal link is separately tested and authorized.

## Current research boundary

현재 **하지 않는 것**:

- social role / pioneer state
- adaptive partner memory
- graph → ant behavior
- graph → Plate excitation
- λ₂ / eigenmode를 biological entity로 해석
- Plate birth retuning
- mature audio runtime optimization
- naive Erdős–Rényi만으로 emergence 주장

Research evidence와 artistic/modeling interpretation을 구분한다. Graph spectral mode → material excitation은 향후 가능한 artistic/mathematical mapping이지 ant biology의 검증된 mechanism이 아니다.

## Current next work

**Latest research decision:** [Endogenous Formation — Contribution & Spatial Extent](w1-endogenous-formation-contribution-spatial-extent-design.md). Contribution-to-configuration, extent and physical event identity need a declared law; no candidate is selected. There is no empirical law selector ready from current archives. One conditional local-unit conformance specification is provided only after that authored law is explicitly chosen; until then, no new converter or experiment is recommended. The [controlled supplied-layer response attribution](evidence/2026-10-11-w1-supplied-layer-response-attribution/README.md) is already complete and supports its restricted normalized-solver claim. The prior [Plate-native contract](w1-plate-native-formation-retention-response-contract.md), [reassessment](w1-formation-plate-deposit-reassessment.md) and [five-repeat locality audit](evidence/2026-10-11-w1-repeat-birth-contact-locality-audit/README.md) remain evidence, not endogenous conversion/loading proof. **W1 remains Undecided / Research Gap**, W2+ gated; the `p` response design stays standalone mathematics.

**Prior episodic/character shadow results:** the following completed analyses are preserved research history, subordinate to the latest reassessment above. The [W1 causal-attribution continuation](evidence/2026-10-08-w1-causal-character-attribution/README.md) completes all three frozen histories through 599.25 s. The single directional estimator now inherits same-cell actual contacts from recorded run start through closure, matching cumulative contact-history qualification; crystallization and consolidation are unchanged. All 328 closures have both bounded coordinates. Morphology remains negative: 228 one-cell closures, sparse frozen material, and giant dense unfinished lineages containing 99.95–100% of pending unions. No substantial frozen cycle appears; one 22-cell episode and an 18-cell union patch reach the existing review scale. Character coverage is complete, but coherent material ontology remains unresolved. The original [attribution stop](evidence/2026-10-08-w1-episodic-material-shadow/README.md) and initial 20 s comparison are preserved. The completed continuity/closure diagnosis is recorded below; stale/reused cumulative character and W2 and later links remain gated. Production movement, material and audio are unchanged. The substrate timbre pass remains a separate artistic/audio side-pass.

The [read-only continuity / closure diagnosis](evidence/2026-10-09-w1-continuity-diagnostic/README.md) verifies the original retention mechanism: original active anchors disappear around 307–309 s, yet 33–45 disconnected descendants still share one episode at 599.25 s. Cumulative union is geometry, not a linkage input. About 38–43% of canonical first admissions have no same-cell point foot in the prior 20 s; q-false filter carry-over is a separate observation. The cumulative contact bit's counterfactual contribution remains unmeasured.

The separately authorized [maximum-overlap split inheritance shadow](evidence/2026-10-09-w1-max-overlap-split-shadow/README.md) is complete with a **Mixed** result. One child retains identity; other children have independent closure ownership without copied parent history. Exact frozen-input/active-mask parity yields 617 rather than 328 freezes, larger isolated fragments and a lower one-cell fraction. Absolute one-cell counts and weighted re-inscription worsen, while ID 0 stays continuously active for 583–585 s and retains 98.2–99.8% of pending union. Actual microholes occur, but no substantial frozen cycles. Both coordinates cover every freeze; two zero-consolidation carry-over forks expose an existing attribution boundary. The giant core and later reabsorption remain unresolved. No second candidate or production change is made; W2 and later links remain gated. A provenance-only nonwinning merge-history proposal is recorded for future design review, with no claim it would close the core.

### Research gate

S2a synchrony null, S2b exact-spatial identity null and S2c incremental predictive-value check are complete. S2a/S2b retain their recruitment/seam and remap/turnover limitations. S2c found no consistent held-out gain from the selected simple temporal graph summaries beyond the compact current-frame baseline.

The current decision is **spectral SKIP**. Keep social topology as a read-only derived observation layer and frozen no-relationship comparison baseline. Do not escalate automatically to another null, spectral diagnostics, roles, adaptive memory, feedback or material coupling. This bounded comparison does not prove that every temporal summary is redundant.

A future relationship/memory hypothesis may reopen social research, but it must be introduced as a new explicit mechanism and compared against the current frozen baseline under matched seeds, movement conditions and observer definitions.

### Material / sound direction

The optional Base Substrate implementation and B/C/D calibration evidence remain preserved, with the feature default Off. It is no longer the conceptual target of an always-present "base plate" that must sound on every step.

The target sound model is now:

```text
activity
→ changes environmental/material state
→ changes physical vibration
→ the current world becomes audible
```

Localized material may develop different resonant character, but **the world itself is the primary sounding body**.

The active architecture sequence is defined in [`world-model.md`](world-model.md):

```text
W0  persistent-world design contract                         COMPLETE
W1  formation / Plate / Deposit research                    UNDECIDED / RESEARCH GAP
W2  material-conditions shadow                               LATER
W3  vitality shadow: movement/environment-condition cost/recovery  LATER
W4  one weak bounded vitality/material effect on movement          LATER
W5  sounding-world / acoustic-climate shadow                 LATER
W6  weak acoustic-climate feedback                           LATER
W7  persistent-world integration                             ONLY AFTER PRIOR GATES

SOCIAL OBSERVATION
  S0/S1/S2a/S2b/S2c                                  COMPLETE / PARKED
  spectral diagnostics                               SKIP
```

Production movement, `TrailPlateBirth`, stratigraphy and audio remain unchanged until each new causal link is separately tested and authorized.

The subsequent [per-cell formation-history audit](evidence/2026-10-09-w1-per-cell-formation-history/README.md) is read-only and preserves both W1 conditions exactly. ID 0's unique union growth is mainly direct first admission (71–74% in the split candidate), with 26–29% merge-first entry and extensive later imported overlap. Its cells have broad temporal/support histories; 62–72% of final union is not currently owned active, while some positions are active under other identities. Actual frozen episodes also contain nonuniform cell histories. Chemical/mechanical/joint predicate duties coincide in the analyzed windows and cannot identify separate physical contributions. This supports questioning historical footprint as uniform material geometry, but selects no material contribution function or new geometry rule. [Chronology](daily/2026-10-09-w1-per-cell-formation-history.md) records the next hypothesis only; W1 viability and later links remain gated.

## Evidence index

### Behavior / movement

- [Interior endpoint shadow selector — frozen three-seed diagnostic; production selector unchanged](evidence/2026-10-08-interior-endpoint-shadow/README.md)
- [Local-accretion shadow — branch-only mixed/negative morphology comparison](https://github.com/oseconds/ant-2026/tree/ant-local-accretion-shadow/docs/ant/evidence/2026-10-08-local-accretion-shadow)
- [Movement / material morphology diagnosis — frozen three-seed archive/replay, no production intervention](evidence/2026-10-08-movement-material-morphology/README.md)
- [Integrated refinement](evidence/2026-10-05-integrated-refinement/README.md)
- [Gait / FOOT_CONTACT](evidence/2026-10-05-gait/README.md)
- [Reinforcement](evidence/2026-10-05-reinforcement/README.md)
- [Turnover](evidence/2026-10-05-turnover/README.md)
- [Founder-effect refinement](evidence/2026-10-07-founder-effect-refinement/README.md)

### Material / audio

- [W1 per-cell formation-history audit — heterogeneous history verified; no material contribution function selected](evidence/2026-10-09-w1-per-cell-formation-history/README.md)
- [W1 max-overlap split inheritance shadow — Mixed; independent closure improves, giant active core and re-inscription remain](evidence/2026-10-09-w1-max-overlap-split-shadow/README.md)
- [W1 continuity / closure diagnosis — verified overlap retention; stale-contact contribution remains partly unidentified](evidence/2026-10-09-w1-continuity-diagnostic/README.md)
- [W1 causal-attribution continuation — complete three-seed analysis; coherent formation remains negative](evidence/2026-10-08-w1-causal-character-attribution/README.md)
- [First W1 shadow — preserved admission-only character-attribution stop](evidence/2026-10-08-w1-episodic-material-shadow/README.md)

- [Surface Plates](evidence/2026-10-05-surface-plates/README.md)
- [Contact sonic baseline](evidence/2026-10-06-contact-sonic-baseline/README.md)
- [Plate decay](evidence/2026-10-06-plate-decay/README.md)
- [Stratigraphy / runtime](evidence/2026-10-06-stratigraphy-runtime/README.md)
- [Runtime re-check](evidence/2026-10-06-runtime-recheck/README.md)
- [Base substrate / Plate Debug — Candidate D substrate is 4.72 dB below born P1](evidence/2026-10-07-base-substrate-debug/README.md)

### Social observation

- [S0/S1 DynamicSocialGraph evidence](evidence/2026-10-07-social-graph/README.md)
- [S2a trajectory synchrony null](evidence/2026-10-08-s2a-null/README.md)
- [S2b exact-spatial-movie identity null](evidence/2026-10-08-s2b-null/README.md)
- [S2c incremental predictive value](evidence/2026-10-08-s2c-incremental-value/README.md)

## Daily chronology

날짜별 실험의 출발 질문, negative result, 방향 전환은 [`docs/ant/daily/`](daily/README.md)에 기록한다.

Daily log는 현재 상태를 덮어쓰는 source가 아니라 chronology다. Current state가 필요하면 이 문서를 먼저 보고, 실험의 상세 claim은 해당 evidence README로 내려간다.
