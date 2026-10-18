# ANT_2026 — Daily Experiment / Process Logs

**Canonical chronology: `docs/ant/daily/`**

이 디렉터리는 상태 요약이 아니라 **실험이 어떤 질문에서 출발했고, 무엇을 관찰한 뒤 어떤 판단으로 넘어갔는지**를 날짜별로 남긴다.

## Source roles

- 현재 verified architecture / research boundary: [`docs/ant/README.md`](../README.md)
- 실험별 수치·원본·재현 명령: [`docs/ant/evidence/`](../evidence/)
- 날짜별 과정/negative result/방향 전환: 이 디렉터리

Daily log는 현재 상태 문서를 덮어쓰지 않는다. 과거 날짜의 “NEXT”는 당시 판단일 수 있으므로 현재 작업을 시작할 때는 먼저 [ANT hub](../README.md)를 확인한다.

## Logs

### 2026-10-18 — Natural dense Plate readout overlap

[Process log](./2026-10-18-natural-dense-readout-overlap.md) · [Evidence package and aligned listening page](../evidence/2026-10-18-natural-dense-readout-overlap/README.md)

- Captured the first 10 seconds after seed `20261005` reached eight historical Plates; Audio-Off/control parity matched across 18,122 tick snapshots
- Full coupled offline replay reconstructed all 60,002 pre-limiter stem steps and 480,000 output frames exactly; 1,279 interval strikes were analyzed
- Rest-of-Plate energy exceeded focal energy in 60.3% of complete 500 ms windows, with wide event variation and descriptive ERB structure differences
- Decision: **DENSE-OVERLAP CANDIDATE SUPPORTED** for a later human listening check only; no subjective judgment or production change

### 2026-10-18 — Plate audio reassessment and live dense-mix plan

[Process / next-pass plan](./2026-10-18-plate-audio-review-and-live-density-plan.md)

- Reconciled completed natural and synthetic one-listener results with the current production baseline; confidence is not perceptual distance
- Parked generic Plate-individuality escalation: no automatic pulse, pickup, selector or descriptor follow-up
- Kept mature AudioWorklet realtime collapse as a separate unresolved issue
- Next bounded question is whether a current-production natural dense mix masks focal Plate response structure even under ideal offline rendering; no production change is selected

### 2026-10-18 — Plate pickup-stem observability

[Process log](./2026-10-18-plate-pickup-stem-observability.md) · [Evidence and reproduction](../evidence/2026-10-18-plate-pickup-stem-observability/README.md)

- Reconstructed per-layer stereo point-pickup contributions plus Sphere exactly at every physics step and output sample
- Raw worklet, solver state, strikes, telemetry, frozen P24/world PCM, and Chrome offline PCM matched exactly
- Kept an opt-in offline readout harness; production worklet and audio law are unchanged
- **SUPPORTED** as observability infrastructure; the dense eight-Plate masking experiment was not run

### 2026-10-18 — Cross-Plate p50 blind listening preparation

[Process log](./2026-10-18-cross-plate-blind-listening-viewer.md) · [Cross-Plate viewer](../evidence/2026-10-13-plate-sonic-individuality/cross-plate-listening.html) · [Viewer guide](../audio-evidence-viewer.md)

- Prepared six deterministic between-Plate trials from the adjacent manifest-order p50 entries, plus one hidden A/A catch using the first entry
- Matched playback now reaches digital pooled stereo RMS 0.08 through a playback-stage Web Audio gain; source WAVs remain unchanged
- Cross-Plate Reveal runs without ERB; Base/Born keeps fixed-gain ERB and gains the same per-pair playback target
- File and repository-root loopback playback passed focused Chromium checks; no cross-Plate human listening assessment was collected
- The 2026-10-15 Base/Born session remains historical evidence and predates the playback-gain revision; scientific decision remains **MIXED**

### 2026-10-18 — Synthetic Plate geometry capability session

[Process log](./2026-10-18-synthetic-plate-shape-capability.md) · [Evidence and blind viewer](../evidence/2026-10-18-synthetic-plate-shape-capability/README.md)

- Froze six connected 96×96 engineering fixtures with common contact and pickup anchors before rendering; source-area and compiled-node residuals are recorded
- Rendered six controlled isolated responses and committed six fixed-gain plus six RMS-matched WAVs; no production source change
- Prepared a separate seven-trial blind session with the fixed geometry-label cycle and a byte-identical compact A/A catch
- Require natural cross-Plate listening to be completed and exported before this synthetic session is opened; no human synthetic-shape result has been collected

### 2026-10-15 — Frozen natural-event ERB crop-boundary sensitivity

[Process log](./2026-10-15-erb-window-boundary.md) · [Evidence](../evidence/2026-10-15-erb-window-boundary/README.md)

- Reproduced 128 prior windows and compared legacy, covered-crop and real-context Hann framing on unchanged PCM
- Broad shape separation survives; some short-window results are context-sensitive. Prior MIXED causal verdict retained; no production/helper/audio change

### 2026-10-15 — Blind first-listen workflow for the static audio viewer

[Process log](./2026-10-15-audio-evidence-viewer-blind-workflow.md) · [Viewer guide](../audio-evidence-viewer.md) · [Natural-event integration](../evidence/2026-10-14-base-born-natural-event-erb/README.md)

- Added seeded anonymous trial order/side mapping, immutable first pre-reveal judgments, separate mode-specific notes, and JSON export to the reusable viewer
- Added one hidden A/A catch using byte-identical q50 Base files already in the frozen 12-WAV set; no audio render or scientific evidence change
- Headless Chromium verified the static viewer, receipts, and export workflow; no human listening assessment was performed

### 2026-10-15 — P24 contact-position modal participation

[Process log](./2026-10-15-plate-modal-participation.md) · [Evidence package](../evidence/2026-10-15-plate-modal-participation/README.md)

- Reused the frozen native P24 p25/p50/p75 fields, raw pickups and PCM plus the q=4 flat/frequency-loss control; no new render
- Shared poles with strongly different contact-mode power maps and fixed L/R pickup observability; full modal sums predict held-out position and loss-control raw-pickup differences
- Decision: **SUPPORTED** for verified autonomous intervals; early active-set wake remains outside the raw-pickup prediction, with production unchanged

### 2026-10-14 — Reusable static A/B audio evidence viewer

[Process log](./2026-10-14-audio-evidence-viewer.md) · [Viewer schema](../audio-evidence-viewer.md) · [Natural-event integration](../evidence/2026-10-14-base-born-natural-event-erb/README.md)

- Added a reusable static A/B viewer; natural-event q25/q50/q75 use the existing 12 WAVs
- Fixed-gain WAVs feed the existing 30-band ERB helper and shared display scales; notes remain browser-local until export
- No new audio render or human listening result; the scientific MIXED decision and production remain unchanged

### 2026-10-14 — Plate ERB response under frozen-world Z coupling

[Process log](./2026-10-14-plate-erb-z-coupling.md) · [Evidence](../evidence/2026-10-14-plate-erb-z-coupling/README.md)

- Reused 16 hash-verified frozen-world PCM files for four `world-none` / `world-z` pairs; exact isolated/none and Z/ZN controls passed
- ERB-time difference patterns partly repeated, while integrated and late profiles and fixed-gain energy remained nearly unchanged
- Decision: **MIXED**; no human listening, new render, or production change

### 2026-10-14 — Plate material contribution at ERB scale

[Process log](./2026-10-14-plate-erb-material-contribution.md) · [Evidence](../evidence/2026-10-14-plate-erb-material-contribution/README.md)

- Reused 78 hash-verified frozen PCM files: 36 native/median pairs and three existing p50 low/high controls; no simulation or render
- Primary ERB shapes and fixed-gain levels were nearly unchanged; a few low FFT-bin differences repeated in the observed-range controls
- Decision: **NEGATIVE** for broad ERB-scale natural-material response; no human listening or production change

### 2026-10-14 — Plate ERB identity across contact position

[Process log](./2026-10-14-plate-erb-position-identity.md) · [Evidence](../evidence/2026-10-14-plate-erb-position-identity/README.md)

- Reused and hash-verified the 36 frozen native p25/p50/p75 one-shot responses
- Full ERB-time identity was not consistent across positions; time-integrated and late-tail profiles showed partial same-Plate grouping
- Decision: **MIXED**; no human identification claim and no production change

### 2026-10-14 — Base/Born causal decomposition

[Process log](./2026-10-14-base-born-causal-decomposition.md) · [Evidence and next hypothesis](../evidence/2026-10-14-base-born-causal-decomposition/README.md)

- Same frozen Born geometries separate excitation, loss, elastic law and rate; one pulse–elastic interaction is demonstrated
- No unique transferable Base character or human listening preference established
- Production unchanged; next unimplemented shadow compares frequency loss with a q=4-matched uniform-loss control

### 2026-10-13 — Plate sonic individuality

[Process log](./2026-10-13-plate-sonic-individuality.md) · [Evidence and next hypothesis](../evidence/2026-10-13-plate-sonic-individuality/README.md)

- Twelve current-law Plates from a 100-birth corpus retain isolated measured spectral identity, including common-material controls
- Four frozen-world Z probes largely preserve their responses; dense mixing and human audible discrimination remain untested
- Production unchanged; one unimplemented next shadow hypothesis tests normalized contact-pulse duration only

### 2026-10-13 — Pre-Astra canonical consolidation

[Process log](./2026-10-13-pre-astra-consolidation.md) · [Architecture synthesis](../2026-10-13-persistent-world-reassessment.md) · [Repository recheck and 13-file inventory](../2026-10-13-repo-hygiene-map.md)

- `8a06d91` was verified as the direct child of `75e53df`, documentation-only, then guarded-fast-forwarded to remote and local `main`
- Corrected broad current wording to distinguish existing aggregate-derived properties from richer episode/order-sensitive character; refreshed the PARK boundary and historical concept-note status
- Audited all 13 untracked shadow-worktree files by SHA-256 and semantic diff; preserved files in place
- No causal experiment, simulation, test, build, branch deletion, worktree removal or prune

### 2026-10-13 — Current persistent-world architecture reassessment

[Process log](./2026-10-13-persistent-world-reassessment.md) · [Synthesis](../2026-10-13-persistent-world-reassessment.md) · [Git hygiene map](../2026-10-13-repo-hygiene-map.md)

- 현재 production/evidence를 바탕으로 causal map과 timescale을 재구성하고, forced-zero와 natural lifecycle을 구분
- Plate/Nodule의 aggregate-derived material character가 이미 존재하는 source path를 확인하고, canonical의 과도하게 넓은 미구현 설명을 수정
- 새 causal link를 선택하지 않고, existing native character의 effective range와 response attribution을 다음 판별 후보로 선정
- Inventory만 수행. Branch/worktree 삭제, Nodule extension, production tuning은 없음

### 2026-10-13 — Nodule timer/blocker instrumentation and prior censoring audit

[Instrumentation log](./2026-10-13-nodule-gap-censoring-instrumentation.md) · [Prior audit log](./2026-10-13-nodule-lineage-censoring-audit.md) · [Instrumentation evidence](../evidence/2026-10-13-nodule-gap-censoring-instrumentation/README.md)

- 고정 400–460 s shadow, arm당 32개 대상: 최종 27개 window-censored / 5개 compaction-loss barriers
- 앞서 발생한 mature proximity block 6건은 restart 뒤 다시 censored됨. 최종 분류와 이력을 구분
- 결정: **WINDOW CENSORING DOMINANT**. 더 긴 gap의 결과는 예측하지 않음

### 2026-10-13 — Natural 600 s Nodule opportunity census

[Process log](./2026-10-13-natural-nodule-opportunity.md) · [Evidence](../evidence/2026-10-13-natural-nodule-opportunity/README.md) · [Independent review](../evidence/2026-10-13-natural-nodule-opportunity/independent-review.md)

- Three default-On natural seeds reached the 32-Nodule cap with A cells still present; A remained at every post-cap census and at the 600 s endpoint
- Spatial exclusion still covered about 93.2–93.4% of repeated Q cell-evaluation visits
- Rechecked the prior fixed-gap geometry: all 27 active timers were nearby at cutoff, so they do not imply eventual birth
- Decision: **MIXED**; keep the cap, do not infer cap-free births, and do not automatically run another Nodule experiment

### 2026-10-13 — MaterialStratigraphy Nodule zero-ant gap lineage

[Process log](./2026-10-13-nodule-zero-gap-lineage.md) · [Nodule lineage evidence](../evidence/2026-10-13-nodule-zero-gap-lineage/README.md)

- Natural arm: 14 gap-born Nodules, including 11 pre-gap timer completions and 3 Plate-reset lineages
- Candidate-timer-clear arm: 13 births; each birth cell was already qualified at gap entry
- Decision: **MIXED**; gap Plates enabled other qualified cells, but none birthed a Nodule during this gap

### 2026-10-13 — TrailPlateBirth zero-ant gap lineage

[Process log](./2026-10-13-trail-plate-zero-gap-lineage.md) · [Candidate-lineage evidence](../evidence/2026-10-13-trail-plate-zero-gap-lineage/README.md)

- Natural zero-ant shadow births were mixed: four continued a pre-gap candidate; four followed post-gap candidates
- Clearing only the in-progress candidate still produced seven post-gap Plate births across all three seeds
- Decision: **MIXED**; no production lifecycle or formation changes

### 2026-10-12 — Zero-ant retained-world continuity shadow

[Process log](./2026-10-12-zero-ant-continuity.md) · [Shadow evidence](../evidence/2026-10-12-zero-ant-continuity/README.md)

- Research-only intervention removed all live ants at 400 s, advanced the unchanged world for 3,600 ticks / 60 s, and resumed recruitment at 460 s
- All three seeds kept world clocks moving; retained pre-gap columns persisted and post-gap ants encountered them under the existing production law
- Decision: **SHADOW ZERO-ANT CONTINUITY SUPPORTED**; no production lifecycle change

### 2026-10-12 — Production material locomotion causal tail

[Process log](./2026-10-12-material-causal-tail.md) · [Causal evidence and independent review](../evidence/2026-10-12-material-causal-tail/README.md)

- One-tick focal resistance removal inside the current default-On world; three seeds, nine prospective gates, 600 s
- Five observed joint-L=0 exits carry movement differences through existing state; four are retirement-censored
- Mobile and small pheromone-state responses, later contact/material history and descendant-world divergence; exact complete-state restore
- Decision: **SUFFICIENT CURRENTLY**; temporary organism after-effect / vitality **PARK**; production unchanged

### 2026-10-12 — Retained material → locomotion production adoption

[Process log](./2026-10-12-retained-material-locomotion-adoption.md) · [Adoption conformance](../evidence/2026-10-12-retained-material-locomotion-adoption/README.md) · [Causal A/B](../evidence/2026-10-11-retained-material-locomotion-ab-final/README.md)

- Fast-forwarded the verified supported A/B branch to `main` before starting the adoption branch
- Made the fixed exposed-layer-count locomotion law the default production behavior; explicit Off remains for controls and replay
- Exact 14-field conformance across all three 600-second seeds for default-On, explicit-On, explicit-Off, saved shadow and prior A/B conditions
- Focused tests, full suite and build passed; fresh independent review recorded with the evidence
- No gain retuning, formation changes, steering feedback or second causal link

### 2026-10-11 — Retained material experience shadow

[Process log](./2026-10-11-retained-material-experience-shadow.md) · [Final replay evidence](../evidence/2026-10-11-retained-material-experience-shadow-final/README.md)

- Three matched 600 s seeds; exposed-Plate occupancy was 48.13–57.94% of active ant-time
- Repeated episodes/top-Plate encounters and pre-entry material exposure appeared across all three seeds
- OFF/ON per-tick parity matched exactly; no production change
- Decision: **SUPPORTED FOR NEXT CAUSAL A/B** as a narrow opportunity; no feedback parameter or effect selected

### 2026-10-11 — Retained material → locomotion causal A/B

[Process log](./2026-10-11-retained-material-locomotion-ab.md) · [Paired A/B evidence](../evidence/2026-10-11-retained-material-locomotion-ab-final/README.md)

- Fixed exposed-layer-count resistance tested in Control/Treatment at the same three 600 s seeds
- All three Control hash chains matched the prior shadow baseline; Treatment reduced travel and contact counts consistently
- Exposure episodes became fewer but longer; Plate birth/coverage direction varied; no stall or collapse
- Decision: **SUPPORTED** as a bounded production-world-law candidate, not adopted; switch remains Off

### 2026-10-09 — Material-mediated social dynamics hypothesis (design only)

[Concept note](../material-mediated-social-dynamics.md) · [Process log](./2026-10-09-material-mediated-social-dynamics.md)

- Fixed Plate character vs changing environmental condition / organism consequence
- Portable, decaying material after-effects on ant internal state; vitality beyond activity alone is a future candidate
- Ant–ant encounter as a separately testable link; distinguish encounter opportunity from true encounter-mediated influence
- “Ant paradise / ant hell” as emergent, reversible observations, **not** predefined good/bad/trap Plate behaviors
- **No experiments or production changes**; W1-first roadmap and S0–S2c parked read-only baseline preserved


### 2026-10-08 — Persistent-world / sounding-world pivot

[`2026-10-08-persistent-world-pivot.md`](./2026-10-08-persistent-world-pivot.md) · [Persistent-world contract](../world-model.md)

- World persists even through zero-ant intervals; agents participate in the world but do not define its existence
- World itself becomes the target sounding body rather than an always-present per-step base plate
- Future material episodes may inherit bounded continuous character from formation history
- Exceptional entities/states are allowed, but influence must remain finite and world-internal
- W2 expands to episodic crystallization + material character; W6 becomes persistent-world integration
- Documentation/design change only; production unchanged

### 2026-10-08 — Local-accretion shadow decision

[`2026-10-08-local-accretion-shadow-decision.md`](./2026-10-08-local-accretion-shadow-decision.md) · [Branch evidence](https://github.com/oseconds/ant-2026/tree/ant-local-accretion-shadow/docs/ant/evidence/2026-10-08-local-accretion-shadow)

- One path-free absolute local-accretion family retained more early topology but converged late toward dense fan/blob material
- Final largest component held 99.43–99.72% of local material; most remaining holes/islands were tiny
- More than half of frozen-cell events still re-inscribed prior territory
- Decision: preserve branch as mixed/negative baseline; do not merge production rule
- Next material hypothesis should use history transition/coherent episodes rather than tune this family

### 2026-10-08 — Circulating-world model design

[`2026-10-08-circulating-world-model.md`](./2026-10-08-circulating-world-model.md) · [World-model contract](../world-model.md)

- Reframe ANT as a circulating world rather than a task-solving agent system
- No prescribed destination/global reward by default; future vitality is state regulation, not a target
- Material and vibration may later become environmental feedback, but only through separately validated links
- No direct vitality→sound mapping and no master-output→simulation feedback
- Initial planned sequence: vitality shadow → episodic crystallization → material feedback → acoustic climate → integration; later refined by the persistent-world pivot above
- Design/documentation pass only; production behavior/material/audio unchanged

### 2026-10-08 — Interior endpoint production candidate rejected

[`2026-10-08-interior-endpoint-production-rejection.md`](./2026-10-08-interior-endpoint-production-rejection.md)

- Candidate branch: `ant-interior-endpoint-production-candidate`
- Richer retained branch morphology survived actual births, but median prior-union overlap increased and median new area per birth fell in all three seeds
- Final 600 s union-area gain was only +2.5–5.1 percentage points despite substantially more Plate births / centerline material
- Decision: **do not adopt the selector into production**; preserve the branch/evidence as a rejected morphology variant
- No candidate production code was merged into `main`; current selector remains unchanged

### 2026-10-08 — Interior endpoint shadow selector

[Chronology](./2026-10-08-interior-endpoint-shadow.md) · [Evidence](../evidence/2026-10-08-interior-endpoint-shadow/README.md)

- Three frozen 600 s seeds; 599 qualification analyses per seed
- All per-tick instrumentation parity and committed trajectory/contact/birth archive comparisons matched exactly
- Shadow added 40 / 52 / 61 selected candidates where production selected none; paired network and footprint measures increased
- 519 / 524 / 522 candidates survived persistence; 44 / 48 / 44 reached isolated scheduler-ready state
- Production selector, movement, material and audio unchanged; stop after this comparison

### 2026-10-08 — Movement / material morphology diagnosis

[Chronology](./2026-10-08-movement-material-morphology.md) · [Evidence](../evidence/2026-10-08-movement-material-morphology/README.md)

- Three frozen 600 s natural seeds; archive reuse plus read-only replay with every-tick and archive parity
- Movement scales, environmental retention, qualification/pruning and frozen geometry measured separately
- Source/boundary selection and pruning directly observed; competition/minimum-length rejection inactive in these runs
- Production unchanged; stop after diagnosis, with one future shadow-selector comparison recommended

### 2026-10-08 — Small dead-code cleanup (branch-only)

[`2026-10-08-small-dead-code-cleanup.md`](./2026-10-08-small-dead-code-cleanup.md)

- Remove only unused distance-based STEP and trajectory-buffer modules, their barrel exports and dedicated tests
- Current FOOT_CONTACT / movement / DSP / social observer / evidence left unchanged
- Static audit and branch diff only; npm/build/browser execution checks pending before merge

### 2026-10-08 — Roadmap refocus: material history

[`2026-10-08-roadmap-material-focus.md`](./2026-10-08-roadmap-material-focus.md)

- S0–S2c social observation/validation is retained as a frozen no-relationship diagnostic baseline
- Current evidence did not justify spectral escalation or social→material causal coupling
- Active development focus moves to Material Voice, then Material History observability
- Future relationship/memory mechanisms, if introduced, must be compared against the frozen S0–S2c baseline
- Longer-term closed-loop candidate shifts toward material/vibration sensing rather than assumed social causation

### 2026-10-08 — S2c incremental predictive value

[Chronology](./2026-10-08-s2c-incremental-value.md) · [Evidence](../evidence/2026-10-08-s2c-incremental-value/README.md)

- Natural archives only; one exact future 1 s merge target and causal predictors
- Three leave-one-seed-out logistic comparisons, with a training-only alignment control
- Primary temporal features slightly improve seed 05 and worsen seeds 06/07
- No consistent incremental gain; spectral SKIP at this gate, with no social-organization claim

### 2026-10-08 — S2b exact-spatial-movie identity null

[Chronology](./2026-10-08-s2b-identity-null.md) · [Evidence](../evidence/2026-10-08-s2b-null/README.md)

- Exact recorded spatial movie; eight deterministic five-second identity nulls per seed
- All frame-level geometry/active-ID invariants and full observer replay pass
- Recent graph differences concentrate around remaps and lifecycle identity repairs
- No social-organization claim; stop after verification, separate commits and branch push

### 2026-10-08 — S2a trajectory synchrony null

[`2026-10-08-s2a-synchrony-null.md`](./2026-10-08-s2a-synchrony-null.md) · [Null evidence](../evidence/2026-10-08-s2a-null/README.md)

- Replayed the three committed 600 s archives; one whole-tuple in-lifetime phase-shift family, 32 replicates per seed
- Original 1 s topology is sparser than the null; short connector counts overlap null variation
- Large seam and birth-phase effects prevent social preference/organization inference
- All 96 rotation/hash invariants, observed archive replay, 270 tests and build pass; stronger movement-constrained validation remains pending


### 2026-10-03 — Runtime / natural sleep diagnosis

[`2026-10-03-runtime-sleep-diagnosis.md`](./2026-10-03-runtime-sleep-diagnosis.md)

- old buried Plate가 왜 natural run에서 계속 active인지 추적
- no-new-strike replay에서 sleep mechanism 자체는 작동함을 확인
- 단순 wake-rule bug보다 coupled-material ongoing excitation 문제로 재정의
- runtime optimization을 별도 known issue로 분리

### 2026-10-05 — Audio evidence / Plate sonic baseline

[`2026-10-05-audio-evidence-and-plate.md`](./2026-10-05-audio-evidence-and-plate.md)

- waveform / grayscale spectrogram evidence 형식 정리
- direct-contact input과 resonator decay를 분리
- 3 ms finite pulse / 75 ms local recovery 채택
- Plate damping ×50로 vibration lifetime 단축
- sonic fix와 runtime fix를 분리

### 2026-10-06 — Social / material two-axis direction

[`2026-10-06-social-material-direction.md`](./2026-10-06-social-material-direction.md)

- 개별 ant보다 연결 / 군체 / 환경 구조로 초점 이동
- fast social graph vs slow material graph 개념 정리
- pioneer를 role이 아니라 retrospective topology event로 정의
- temporal graph / density confound / null-model 질문 구체화

### 2026-10-07 — Founder refinement → S0/S1 completion

[`2026-10-07-founder-refinement-and-handoff.md`](./2026-10-07-founder-refinement-and-handoff.md)

- low-evidence founder-lock-in refinement 채택, behavior 동결
- matched-seed natural evidence와 visual review
- roadmap을 graph → temporal → null → spectral(if useful)로 수정
- S0/S1 `DynamicSocialGraph` / `TemporalSocialTopology` 구현 완료
- graph OFF/ON behavior invariance 확인
- 250 ms connector는 짧고 recruitment-center-local, 1 s+ persistent connector는 0
- 현재 persistent pioneer/social organization은 미입증
- 다음 gate는 movement-constrained null validation

### 2026-10-07 — Born-Plate pickup readout A/B

[`2026-10-07-born-plate-mix-ab.md`](./2026-10-07-born-plate-mix-ab.md)

- Frozen seed/input and all 63 accepted P1 strike frames matched exactly
- Plate-only mix gain raised pooled RMS +10.59 dB; no clipping/non-finite samples
- Candidate remained 18.60 dB below the unchanged substrate stem
- Stop this pass; pickup-distance/readout topology is the next hypothesis

### 2026-10-07 — Born-Plate pickup-distance diagnosis

[`2026-10-07-born-plate-pickup-distance.md`](./2026-10-07-born-plate-pickup-distance.md)

- Frozen P1 descriptor and 63 accepted strikes matched exactly
- Natural event-aligned correlations were moderately negative
- Equal-strength midpoint response was about 13 dB below direct-pickup controls; the far-branch counterexample prevents a monotonic distance-only claim
- Evidence recorded before testing any pickup-topology candidate

### 2026-10-07 — Full frozen P1 observability map

[Node-map evidence](../evidence/2026-10-07-base-substrate-debug/audio/p1-node-observability/README.md)

- One identical controlled strike measured at all 48 valid P1 solver nodes
- Channel-matched RMS tracks pickup distance; pooled output also varies strongly with location/topology
- Nearby low-output and similarly distant high-output regions support a small finite-area pickup-aperture hypothesis
- Candidate topology remains untested; production DSP and simulation unchanged

### 2026-10-07 — Frozen P1 pickup-aperture A/B

[`2026-10-07-born-plate-pickup-aperture.md`](./2026-10-07-born-plate-pickup-aperture.md) · [A/B evidence](../evidence/2026-10-07-base-substrate-debug/audio/p1-pickup-aperture-ab/README.md)

- One sigma-1 Gaussian aperture used only each compiled pickup and its direct same-layer 1-hop neighbors
- Pooled 100/250/500 ms P10 fell 23–25%; natural pooled 10 s RMS rose only +0.46 dB with an L/R tradeoff
- Spatial rank remained recognizable, but the weak tail worsened; reject and stop without tuning
- Production point pickup and all simulation/material/audio settings unchanged

### 2026-10-07 — Event-count matched substrate vs born P1

[2026-10-07-event-count-matched-substrate.md](./2026-10-07-event-count-matched-substrate.md) · [PCM evidence](../evidence/2026-10-07-base-substrate-debug/audio/event-count-matched-substrate/README.md)

- Frozen 63 P1 accepts map to 44 unique FOOT_CONTACT groups; production substrate emits one generic excitation per group
- Matched substrate pooled RMS is +21.44 dB over born P1 after configured gains; original all-events stem remains +29.19 dB
- Raw worklet and fixed-gain levels recorded separately; no clipping/non-finite samples or production changes
- Matched subset difference includes event selection, timing and position; no pure density or masking claim

### 2026-10-07 — Base substrate / born P1 output calibration

[2026-10-07-base-substrate-calibration-0.025.md](./2026-10-07-base-substrate-calibration-0.025.md) · [PCM and fixed-scale evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.025/README.md)

- Candidate B separates Plate ×1 from Sphere `1/sqrt(12)` and lowers the substrate output ratio to `.025`
- Frozen 63 P1 strikes and 44 matched substrate parent groups reused; no simulation or event schedule changes
- Pre-birth B is nonzero, but first-birth all-event substrate is only 0.29 dB below born-only P1 pooled RMS
- Quiet-bed / obvious-new-Plate gate fails; default stays Off and no further tuning is made

### 2026-10-07 — Base substrate / born P1 Candidate C

[2026-10-07-base-substrate-calibration-0.010.md](./2026-10-07-base-substrate-calibration-0.010.md) · [PCM and fixed-scale evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.010/README.md)

- Same frozen P1 setup as Candidate B; only ratio changed `.025 → .010`
- All-event substrate is 8.24 dB below P1 in the first 10 s, about 10 dB below at P1 event windows
- Comparative level gate clears; no intermediate setting tested; default remains Off
- Report margin first; no commit, merge or push

### 2026-10-07 — Base substrate / born P1 Candidate D

[2026-10-07-base-substrate-calibration-0.015.md](./2026-10-07-base-substrate-calibration-0.015.md) · [B/C/D PCM and listening evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md)

- Same frozen seed/input/P1 descriptor, 63 accepted strikes and 44 matched parent groups; only ratio changed `.010 → .015`
- D all-event substrate is 4.72 dB below born-only P1: +3.52 dB vs C and −4.44 dB vs B
- Pre-birth Off remains exact silence; D On is nonzero; all stems finite and unclipped
- Native-level B/C/D comparison page and requested test/build/dev/prod checks pass; keep default Off and stop without commit/merge/push

### 2026-10-08 — Candidate D shared absolute gain

[`2026-10-08-candidate-d-absolute-level.md`](./2026-10-08-candidate-d-absolute-level.md) · [WAV, plots and measurements](../evidence/2026-10-08-candidate-d-absolute-level/README.md)

- Applied the same fixed +18 dB or +20 dB gain to frozen Candidate D P1-only, substrate-only and sum stems
- Candidate D settings and P1/substrate relative level stayed unchanged; six 10 s lossless WAVs and fixed-scale plots produced
- Both gains had zero clipping/non-finite samples; browser playback checks loaded and started all six files
- At the pass stop there was no threshold decision, commit, merge or push
- Subsequent direct listening judged D too dominant and the substrate timbre too metallic / long-tailed; next audio side-pass shifts timbre toward dull, sand-like and granular before re-calibrating level
- Calibration tooling/evidence was later committed and merged via PR #1; base substrate remains default Off

## Logging rule

새 과정 로그는 `YYYY-MM-DD-topic.md` 형식으로 추가한다.

가능하면 다음을 남긴다:

- 출발 질문 / hypothesis
- baseline
- 실제 변경
- evidence / negative result
- 판정
- 남은 한계
- 다음 pass로 넘어간 이유

commit timestamp와 실험 날짜가 다를 수 있으므로, 별도 검증하지 않은 wall-clock chronology를 추정해서 쓰지 않는다.
