# ANT material-formation responsibility — 2026-10-13

## Decision

**MIXED / UNRESOLVED. The next discriminator is temporal observation, not a production formation change.**

Current formation already converts a spatially selected, persistent chemical/mechanical corridor into an immutable Plate, and permits repeat layers after additional contacts and a refractory period. It does not define a Plate as previously unoccupied space, a complete activity episode, or every supported trace. No missing production responsibility has yet been demonstrated against that authored law.

The selector is the strongest measured spatial compression. Widening it indiscriminately has counterevidence. Current evidence cannot tell whether the omitted temporal information would distinguish consequential renewed inscription from ordinary continuation. Existing state **sampled over time** can test that distinction before adding production state. One instantaneous state or birth descriptor cannot reconstruct the complete history.

Repeated inscription is already causal at two levels: fresh contacts can qualify a repeat birth, and new overlapping Plates increase retained columns/depth. It should become an explicitly labeled **observation** for the next investigation, not automatically a new material object, modification rule, or episode subsystem.

## Question, scope, and repository boundary

What should constitute a new material event as ANT repeatedly inscribes overlapping territory? This pass reassesses the responsibility before choosing any mechanism.

Remote references were checked live with `git ls-remote origin`:

| Reference | Verified commit |
| --- | --- |
| Production `main` | `d45823d40c9a87c1b333fa9872f3c897ee9ab01b` |
| Completed selector-history investigation | `f7c104834e086524e02b166a7eb24e3c78157b4a` |
| Its morphology-attribution parent | `92d5917bc12baca48e936332ec05d22297cb1276` |

This investigation uses branch `codex/ant-material-formation-responsibility-20261013`, based directly on verified `f7c1048`. `git diff main-SHA f7c1048 -- src/lib/agents/ant` is empty. Therefore the inspected ANT implementation is the verified production implementation. Investigation HEAD also contains UI, transport, and audio-bridge lineage beyond production main; those unrelated differences are not formation interventions or evidence of production adoption.

At entry, tracked status/diff were clean. Untracked selector-shadow scripts, test, and evidence from the interrupted pass were present. Their contents were not used or verified, and they remain untouched. The existing secondary `ant-retained-material-experience-shadow` worktree also contains uncommitted material; it remains untouched. No new worktree was needed. No excluded historical directory was accessed.

The parent read and applied the installed `caveman` skill. Source/evidence audits used GPT-6 Luna High; the complete-state null and discriminator assessment used Luna Max. A fresh Luna Max review checks the resulting document separately from those audits.

This is a source/evidence synthesis with source-level counterexample constructions. No diagnostic code, natural run, alternate selector, production history state, parameter change, or external research was needed. No new machine-readable experimental result is claimed.

## Source and evidence inventory actually used

All local paths below are relative to repository root. Source line references refer to the inspected `f7c1048` tree; the ANT source blobs match production main.

| Source | Use and limits |
| --- | --- |
| `AGENTS.md`; `docs/ant/README.md` | Current constraints, canonical implementation/evidence hub, and parked boundaries. |
| `docs/ant/world-model.md` | Future design contract. Its episode/vitality concepts do not establish implementation or a selected next mechanism. |
| `src/lib/agents/ant/AntController.js:292`; `AntAgent.js:7`; `GasterDeposition.js` | Tick ordering, realized travel/deposition, stochastic agent/spawn/decision inputs, and local column feedback. |
| `src/lib/agents/ant/PheromoneField.js:1` | Decay, bounded spatial deposit representation. |
| `src/lib/agents/ant/SurfaceField.js:1` | Slowly relaxing contact compaction and conditional support samples. |
| `src/lib/agents/ant/TrailPlateBirth.js:34`, `:49`, `:190`, `:242`, `:263`, `:332` | Contact counts, chemical EMA, candidate selection/persistence, repeat qualification, and descriptor dependencies. |
| `src/lib/agents/ant/MaterialStratigraphy.js:39`, `:179`, `:347` | Immutable descriptor insertion, ordered columns, current exposure and burial depth. |
| [Current morphology attribution](../2026-10-13-morphology-attribution/README.md), its replay provenance/measurement files and [daily entry](../../daily/2026-10-13-morphology-attribution.md) | Current default-On baseline, 100 births, stage compression and established observer parity. The runner's capture code was inspected for packet coverage. |
| [Current selector-history audit](../2026-10-13-selector-history/README.md), `data/summary.json`, and [daily entry](../../daily/2026-10-13-selector-history-audit.md) | Prior-union denominators, discarded/retained geometry, conditional results and limitations. |
| [Interior-endpoint shadow](../2026-10-08-interior-endpoint-shadow/README.md), [shadow daily record](../../daily/2026-10-08-interior-endpoint-shadow.md), [production rejection](../../daily/2026-10-08-interior-endpoint-production-rejection.md) | Prior selector relaxation and its rejected material-history result. These runs predate current default-On locomotion. |
| `bb970505eb63e9f69d2d00bc302ee72fbe19419e:docs/ant/evidence/2026-10-08-interior-endpoint-production/README.md` | Branch-only completed production-candidate evidence, read with `git show` without changing checkout. Historical comparison, not current-main source. |
| `13ffc9f42bc32083c87c6b1c97bc82092e03e472:docs/ant/evidence/2026-10-08-local-accretion-shadow/README.md` | Branch-only completed local-accretion mechanism, results and decision, read through its normal evidence path with `git show`. Historical frozen inputs, not current-default-On runs. |
| [Locomotion A/B](../2026-10-11-retained-material-locomotion-ab-final/README.md), [adoption](../2026-10-12-retained-material-locomotion-adoption/README.md), [pre-cohort history](../2026-10-12-pre-cohort-retained-history/README.md), [causal tail](../2026-10-12-material-causal-tail/README.md) | Existing material-world consequence, source/age distinctions, limits of seed/RNG interpretation, and no demonstrated need for organism after-effect. A/B's historical default-Off wording is superseded by adoption. |
| [Zero-ant Plate candidate lineage](../2026-10-13-trail-plate-zero-gap-lineage/README.md) | Counterevidence to requiring renewed live activity or uninterrupted candidate state for every birth. Forced shadow, not natural empty-world lifecycle. |
| `docs/ant/daily/README.md` | Chronology convention and discovery link for this result. |

Earlier memory notes helped locate the completed interior-endpoint rejection. All claims here were checked against current source or the committed evidence listed above. Ignored draft evidence, interrupted selector-shadow outputs, and old roadmaps were not used as findings.

## Current formation information flow — implementation facts

```text
tick-entry ordered material columns
  aggregate local layer count L
  bounded desiredSpeed multiplier
  later realized movement after collision/domain handling
    gaster pheromone deposition
      bounded PheromoneField, decaying half-life 15 s
      sampled half-saturated chemical EMA, time constant 20 s
    gait FOOT_CONTACT
      saturating SurfaceField compaction, half-life 1800 s
      retained per-cell accepted-foot totals
  one-second formation analysis
    chemical >= .30 and local support >= .015
    skeleton/components and source-annulus-to-boundary extraction
    similar-candidate persistence >=20 s
    global gap >=10 s
    if prior corridor matches: age >=90 s and >=30 post-birth feet
    immutable descriptor, geometry and aggregate-derived properties
  ordered MaterialStratigraphy insertion
    current top/exposure and depth from later overlapping material
    later tick-entry L
```

This map describes responsibilities, not an independent causal decomposition of naturally coupled stages. Tick-entry material precedes current movement; current movement/contact deposits enter formation later in the same tick. New material enters locomotion from the next tick.

| Representation | Information retained / timescale | Compression or loss |
| --- | --- | --- |
| Realized movement and current occupancy | Current position/velocity/intention plus collision-constrained, in-domain travel. Contact and deposit events are emitted. | Production does not keep a complete trajectory movie for formation. Evidence recordings can keep one. Current occupancy is not cumulative material. |
| Pheromone field | Spatial, bounded, decaying reinforcement. Default 15 s half-life and maximum 8; movement-driven deposition is tied to realized travel. | Direction, individual contributor identity, and complete deposit ordering are not retained as an event list. Saturation and spatial spread are lossy. |
| TrailPlate chemical memory | `u=P/(P+.04)`; `M <- M+(u-M)*(1-exp(-dt/20))`, normally sampled about once per second. | This is an EMA of an already decaying field, **not a lifetime integral**. At zero input M decays with 20 s e-fold time (half-life about 13.86 s). A scalar sample does not identify onset/return/order. |
| SurfaceField | Individual feet produce spatially spread saturating deposits, `v <- v+(1-v)*.025*weight`; relaxation half-life 1800 s. Support averages a local disk of radius .025. | Long mechanical memory can survive short chemical/traffic changes. Contributor identity, contact age distribution and full loading order are absent. Strengthening/weakening here changes a support field, not existing Plate coefficients. |
| TrailPlate contact counts | 96x96 cumulative `Uint32` foot totals; each accepted in-domain foot increments its mapped cell until saturation. | No timestamps, ant identity, distinct traversal, direction, or count rate. These counts are separate from slowly decaying compaction; they are not independent confirmation of two causes. |
| Candidate persistence | Current selected corridor plus `startedAtMs`, stable seconds and similarity to the immediately previous candidate. Similarity >=.60 carries the timer; loss or dissimilarity resets it. | Temporal evidence exists, but at selected-corridor level. Pairwise continuity can drift; it is not continuity of every supported cell or a full episode record. |
| Repeat birth records/gates | Prior masks/paths, birth clocks, counts at birth; newest match by mask or path similarity >=.60. Repeat requires >=90 s and >=30 additional accepted feet inside that **prior frozen mask**. | It does encode post-birth activity, narrowly. Contacts may all occur at one place or in one burst; distinct ants/cells and a quiet interval are not required. A partially overlapping candidate below match threshold has no such matched-repeat gate. |
| Immutable Plate | Birth time/id; selected mask, centerline/edges/path/widths/pickups; stable seconds, similarity, geodesic length and total contacts; mean chemical/support and bounded material mapping. | Current spatial means and a few temporal summaries replace complete field/contact histories. No full formation contributor or repeated-inscription timeline. Existing descriptors are not evicted; cap256 stops further births. |
| MaterialStratigraphy | Plate identity, insertion order, bottom-to-top cell columns, current exposure, thickness and burial by later layers. | It already retains material order/depth. It does not infer the activity episode responsible for a layer. The binary prior union used in the audit discards these facts; stratigraphy itself does not. |
| Local layer feedback | Current center-cell aggregate `L`; `m(L)=1-.10*(1-exp(-L/4))`, applied once to desired speed. | This read intentionally ignores individual identities, order, depth, character and exposure chronology. Its maximum slowdown is 10%; it does not directly steer. |

The same activity leaves multiple different summaries: pheromone, chemical EMA, compaction, contact counts, and frozen geometry. This is neither complete duplication nor independent evidence. The chemical pair smooths short history twice; compaction integrates it much more slowly; contact totals ignore decay; immutable layers preserve selected past outcomes.

## What birth does and does not destroy

**Spatial compression:** current extraction discards most of the chosen skeleton component. Frozen ribbon construction then expands the selected network; it does not add another major measured narrowing.

**Temporal compression:** birth retains time, stable duration, similarity and counts, but not contact cadence, local rise/fall history, chemical/mechanical lag, prior qualification failures, or a sequence of spatial support changes. These are also compressed upstream, before birth. Calling all loss a freeze operation would misattribute it.

**Identity/order loss:** contact/deposit contributor identity and order do not survive the field/count summaries. By contrast, Plate identity/order/depth survive in stratigraphy. The audit's prior union hides that retained information.

**Repeated-inscription loss:** repeat qualification remembers a cumulative increment since the newest matched prior birth. It does not say whether that increment was a distributed traversal, continuous use, a concentrated burst, or activity after absence. Its descriptor stores total contacts over the supported corridor; that need not equal the count over the prior frozen mask used by the repeat gate.

**Transition/rate loss:** slopes and zero-contact intervals require at least two ordered observations or a recorded event stream. They cannot generally be recovered from a single final mean/count. Candidate stable seconds supplies one selected-corridor continuity measure, not every transition.

### Constructive ambiguity, with explicit limits

Two accepted foot-event streams can deliver the same N feet to the same cells, with different timestamps, order, ant identities, or leg labels. `TrailPlateBirth.observeFootContact()` depends on valid positions and count, not those histories. It therefore produces exactly the same count array for both streams below saturation.

Hold externally supplied chemical/support fields, analysis clocks, prior records, and candidate lineage fixed in an isolated formation fixture. Deliver all N feet before the same birth: one stream concentrates them early, another distributes them later. Their formation descriptors are identical because all descriptor dependencies and final count sums are identical. With a matched prior corridor, both streams also satisfy the same repeat gate once age/count requirements hold. This is a source-dependency construction, **not an executed natural paired experiment**. In a coupled world, different contact timing may change SurfaceField or movement; equal complete natural state is not claimed.

Similarly, a chemical EMA endpoint is many-to-one. For equal sample spacing with `a=exp(-dt/20)`, two updates contain the weighted term `(1-a)*(a*u1+u2)`. Replacing inputs with `u1+d` and `u2-a*d`, within valid bounds, leaves that term unchanged. This algebra demonstrates lost ordering/amplitude information. It makes no Float32 byte-equality or naturally reachable full-world claim.

These constructions demonstrate summary ambiguity. They do **not** show that ANT ought to give different material outcomes to those histories. Under identical current complete state, future inputs and RNG, deterministic production should give identical future results. A proposed new history variable needs a specified additional responsibility, not a collision between two descriptors alone.

## Existing observations and counterevidence

### Current morphology and discarded history

**Measured observation:** the default-On 600 s runs produced 29/33/38 births, 100 total. Movement windows had median radial alignment about .90 and tortuosity 1.18–1.22, but broader occupancy than selected routes. Mechanical qualification changed the chemical-qualified count at only 1/100 births. The selected network retained per-seed medians 29.0%, 31.6%, 30.8% of its chosen skeleton component. Freeze matched the selected descriptor.

**Measured observation:** current selector discards a median 69.5% of chosen-component pixels. For 97 births with prior material, discarded potential footprint median novelty is 15.2%, overlap 84.8%; 85/97 have majority overlap. Conditional median new footprint cells are 443 discarded versus 107 retained. Across all 100, these medians are 461.5 versus 108.5, with discarded novelty 15.7%. Separate medians are not one representative birth and must not be added as paired totals.

**Inference:** pruning is a coarse brake on repeat footprint, while also losing considerable new area. The retained footprint is more overlap-heavy by fraction, so current extraction does not preferentially retain novel territory. Novelty falls strongly as union grows; a binary never-before-occupied test becomes progressively sparse. None of this assigns value to overlapping history or proves that all lost branches are dispensable.

### Wider selectors and local maturation

**Historical measured observation:** the interior-endpoint production candidate increased branches and births, but prior-union overlap rose in every seed (.948 to .976, .904 to .968, .912 to .969), and new area per birth fell. It was rejected. Its earlier shadow alone did not establish actual production consequences.

**Historical measured observation:** local accretion removed the path requirement and froze locally eligible cells after 20 s. Crucially, it already reset on sampled eligibility loss and allowed later rematuration; continuously eligible cells did not periodically freeze again. Its two-distinct-contact-timestamp guard was cumulative, not a requirement for fresh contacts in the current qualification interval. Nevertheless, more than half of frozen-cell events re-inscribed prior territory, and the largest final component contained 99.43–99.72% of material. Early extra holes/islands mostly became late filling or tiny satellites.

**Inference and counterevidence:** spatial relaxation alone is insufficient for the previously tested sustained-novelty goal. Simple threshold crossing/rematuration alone is also insufficient. These results do not prove that every temporal discriminator would work or fail. Both families used older histories without the now-adopted material resistance and are not matched causal results for today's default-On world.

### Persistent history and actual world consequence

**Implemented fact:** a repeat Plate can deepen retained columns and change later `L`, even if its footprint is wholly overlapping. A spatially old layer can therefore have an existing world consequence. That consequence does not certify every repeat layer as meaningful.

**Measured observation:** the adopted locomotion A/B reduced travel/speed and lengthened exposure while Plate-count/coverage directions varied. The pre-cohort observer found older-than-all-live-ant material in 46.07% of active ant-time. The causal-tail study found existing movement/environment carriers sufficient for the tested after-effect; vitality remains parked.

**Measured counterevidence:** in the imposed zero-ant gap, four of eight natural-arm gap births continued an old candidate and four followed new candidate lineages. Clearing only the pending candidate still allowed seven gap births across the three seeds. Retained inputs can complete or regenerate the current process without new gap contacts. Thus a candidate onset does not establish a renewed live inscription event. This forced gap does not establish natural zero-ant lifecycle or autonomous physical crystallization.

## Competing explanations

| Explanation | Strongest support | Counterevidence / missing decision |
| --- | --- | --- |
| Current law adequate; variety is an artistic extension | The law fulfills its authored persistent-corridor/repeat-layer function. Order/depth and bounded world feedback already exist. | Lossy formation summaries and substantial omitted space are real. Their importance for a different responsibility has not been decided. This null remains viable. |
| Selector responsibility | Largest observed narrowing occurs at spatial extraction; discarded geometry includes more new cells in absolute terms. | Wider endpoint paths already increased redundant layering. This does not rule out every selector design, but gives no unique new extraction law. |
| Transition responsibility | Instantaneous means/counts cannot describe return, cadence or change; fast chemical and slow mechanical memories may diverge. | Production already uses EMA, persistence and fresh-count gates; local accretion already used rematuration. No current natural temporal class has yet been shown to require another outcome. |
| Repeated inscription should modify existing material | Contact loading already strengthens/relaxes SurfaceField; immutable Plate properties cannot reflect later formation loading. | Choosing consolidation/erosion/character modification is a new modeling law. Existing exposure/depth already changes without rewriting Plate coefficients. No evidence here selects modification over layers. |
| Some repeats deserve new layers but need richer history | Current repeat gate collapses distributed versus concentrated and continuous versus returning use; spatial novelty cannot capture these differences. | Need to show those natural histories are distinct beyond existing summaries and specify why their consequences should differ. No threshold or episode architecture follows yet. |
| Explicit coherent episode required | A full event might need onset/end and participating cells beyond one selected candidate timer. | A time-sampled observer can first expose those facts without production state. No evidence establishes a coherent event unit or necessary persistence beyond existing fields. |

The responsibility question has moved beyond finding the widest selector. The location of spatial loss remains known; whether that loss is the next mechanism to change remains unresolved. Temporal observation is the smallest decision-changing investigation, not proof of temporal necessity.

## Can existing state supply a discriminator?

**Yes for read-only observation; not generally from one snapshot.** Copy successive existing chemical EMA, support samples, supported masks, candidate state and per-cell cumulative counts. Difference the counters to obtain accepted contacts per existing analysis interval. Existing thresholds reveal unsupported-to-supported crossings; their original field amplitudes reveal rise/fall and lag without new thresholds. Existing birth records and ordered columns supply the prior material relationship.

A live observer can record already emitted foot events if subsecond cadence is required. That records existing causation; it does not create organism memory. The current attribution packets retain birth-time fields and continuous positions, but not the entire intervening per-cell support/chemical/count sequence. Birth-to-birth endpoint differences cannot identify an intermediate loss/return. Older full qualification packets lack current default-On world feedback; they cannot replace the missing current trace.

The smallest observer therefore needs temporary diagnostic storage for prior sampled arrays and output records. This is not new causal formation state. It cannot recover activity that was never recorded. Even successfully distinguishing histories does not select a material consequence.

An explicit episode representation is **not justified now**. If later evidence and an explicit modeling requirement demand one, its minimum responsibility would be a bounded onset/continuation/end or return marker, participating spatial cells, the prior-material reference, and only the temporal statistics necessary for that specified consequence. Contributor identities, social roles, organism vitality, material classes, global clocks, and an episode manager do not follow automatically. Prefer a smaller transition variable if it suffices.

## Repeated inscription and existing material

| Possible consequence | Current assessment |
| --- | --- |
| Nothing new | Valid below current gates; no need to force material growth. A new silence rule would itself require justification. |
| Modify existing character | Not selected. SurfaceField already changes, but Plate coefficients are immutable. Later character modification would be a separate causal mechanism. |
| Deeper layering | Already implemented when a new overlapping descriptor is inserted; depth comes from material above, not age. |
| New immutable material | Already implemented after selected-corridor qualification and matched-repeat gates. A different event identity has not been established. |
| Observation only | Recommended now: label support/contact lineage without prescribing consequences or calling every return a new material event. |

Spatial extension, changing local support, and a repeated layer are different facts. None is a universal criterion for a meaningful new event. The current law is an operational choice; a future change must name the responsibility it improves and compare against this retained baseline.

## RNG: production concern versus validation concern

**Implemented fact:** current agents/spawning use stochastic position/heading, personality, timing, exploration and local option variation (`AntAgent.js:7`; `AntController.js:444`, `:499`). Fields retain consequences of those paths; thresholds, smoothing, deterministic extraction and aggregate freezing compress them. Formation does not add a random morphology preset.

**Evidence-backed inference:** substantial downstream pruning of already broader inputs makes compressed representation a plausible explanation for limited visible diversity. The evidence does not identify insufficient random amplitude as its cause. Some seed-dependent geometry/count differences survive; complete erasure of stochastic effects is also unsupported. No RNG ablation or broad independent-seed population study was performed here.

Keep RNG unchanged. A future causal candidate needs matched fixed-seed comparison, with state/call-count accounting and plain/observer parity. If it advances toward adoption, a separate bounded independent-seed world-character check should examine whether its intended responsibility generalizes or creates common filling/trapping patterns. That check supplements matched causal evidence; it does not replace it or authorize amplitude/seed tuning to obtain desired pictures.

## Single smallest next bounded pass

> If local return carries formation information beyond existing persistence/repeat summaries, then under fixed current-production seed `20261006`, selected-corridor lineages restarted since their matched prior birth should differ from lineages continued since that birth in where per-cell support re-onsets and fresh contacts lie relative to frozen prior material and layer order, beyond comparable birth-time geometry, means and gate totals, without changing movement/RNG, fields, selector/gates, or stratigraphy.

Run **one 600 s seed with a plain/read-only observer pair**, retaining one fixed natural history rather than introducing a treatment. The birth-time packets cannot reconstruct the missing inter-birth sequence: this requires rerunning that fixed current-production input. Record at the existing one-second analysis cadence: full chemical EMA and supported mask, mechanical support, candidate presence/geometry/start/stability, and per-cell contact-counter increments. Associate observations with the newest matched prior birth, its exact mask, and current column order. Include observations where repeat-specific age/contact gates pass but another birth gate blocks emission; a fully birth-ready production analysis should emit a birth, not be labeled a nonbirth control. Do not select only attractive births.

The primary comparison unit is an analysis observation associated with a matched prior Plate ID. Record that prior birth's candidate start time in the observer. A continued selected-corridor lineage carries that start time through to the current observation; a restarted lineage has a subsequent start time. Report intervening prior-match changes rather than treating different Plate IDs as one corridor. Separately retain each cell's eligibility-loss/return sequence since the prior birth. These are two axes: a candidate can restart while cells remain eligible, or cells can lose/return while the selected candidate's timer continues. Do not collapse them into a single episode/restart label.

A selected-route switch can restart the candidate timer while its local territory remains eligible. Therefore distinguish a selector-only restart from a real per-cell eligibility break/return using the full supported mask; candidate absence or stableSeconds alone does not establish local absence. Do not borrow the separate Nodule timer as Plate episode state.

Use existing qualification/similarity predicates. Record all sampled zero-increment interval lengths and observed loss/return boundaries; invent no minimum quiet duration, derivative cutoff, eligibility score, or material-event threshold. Changing a prior match must be reported, not silently merged into one event. Initial and terminal spells are censored; one-second observations cannot establish subsecond absence. Chemical-only, mechanical-only and joint transitions should remain distinguishable.

The observer's timing classes are descriptions. Its comparison observable is the **spatial relationship to frozen prior material and ordered columns** of support re-onsets and fresh count increments, beyond aggregate birth summaries. Contact increments and mechanical support share the same foot causes; their mutual correspondence is partly expected by construction and is not independent corroboration. Report chemical and mechanical contributions separately. Birth-time geometry/means/gates provide the comparison context; if naturally comparable cases or both lineages are absent, report insufficient comparison rather than forcing matches or expanding automatically.

Relate each interval's contact increments and support transitions to the column snapshot at that interval's start, excluding Plates inserted at its ending analysis. Record ending-boundary births separately. Otherwise the contacts that qualify a birth could appear to act on the layer created afterward, reversing causal order. Keep the matched prior descriptor/mask immutable throughout its comparison interval.

**Falsification/park:** if return/continuation classes are absent, or their observed differences are already explained by candidate persistence, prior-match changes and existing birth summaries, park richer history representation. If materially comparable natural cases expose additional spatial/temporal information, retain that result as omitted-history evidence. A positive association still does not establish a need for different births, a causal benefit, or a coherent episode subsystem.

Validation for that future observer: production source equality; pre/post-read nonmutation; counted RNG equality; full plain/observer replay parity including fields, contacts, candidates, births and final state; finite arrays; focused interval/censoring/count-difference tests. No production A/B or threshold tuning belongs in it. This pass does not execute that observer.

## Unresolved questions that affect that pass

1. Does the chosen natural seed contain both comparable restarted and uninterrupted matched-repeat lineages? The current birth-only packet cannot answer their intervening history. Absence is a valid bounded result.
2. Are contact renewal and chemical re-onset spatially aligned, or does residual mechanical support permit a candidate restart without fresh local inscription? The forced-gap result makes the latter plausible.
3. How much of any observed distinction survives existing stableSeconds, mask/path matching and mean material mappings? Descriptor omission alone is insufficient.
4. What specified world consequence would require different treatment of two observed histories? This remains a modeling decision after the observer, not an empirical label to invent here.

## Verification, preservation, and parked scope

This documentation-only synthesis required no tests/build, browser, audio, new replay, or diagnostic validation. Existing tests/parity numbers cited above belong to their evidence packages, not this pass. Fresh independent Max [review](independent-review.md) accepted the synthesis and observer design with no blocking factual or epistemic findings; it does not validate a future observer implementation.

Parent verification: 15 local Markdown links resolve; staged whitespace check passes; staged scope contains exactly four documentation files; `git diff f7c1048 -- src scripts tests package.json package-lock.json` is empty. ANT source equality against live-verified production main also passes. No unrelated file is staged.

Only this package, its concise daily entry, and the chronology index are part of the investigation commit. Tracked/untracked/ignored/unpushed state is inspected at completion; unique dirty material is preserved. Completed work is committed and pushed on its dedicated investigation branch, without a PR, merge, force-push, or worktree deletion.

Parked: production selectors and birth laws; episode/vitality implementation; social feedback/roles; Nodule redesign; substrate tuning; coefficients/audio/DSP/Z coupling; realtime AudioWorklet collapse. Desired sound and desired morphology variety are not evidence selecting the material-event law.
