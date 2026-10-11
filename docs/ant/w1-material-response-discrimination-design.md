# W1 Material Response Discrimination Design

**Decision date:** 2026-10-11

**Research source:** `ant-w1-episodic-material-shadow` at `d59eaa984ad73dfeeeea7a6af6039685f236838f`

**Production comparison:** fetched `origin/main` at `a78249fc02fb7990568d62709e9a087489fe632b`; the entire `src/` tree is identical

**Status:** one candidate selected for a future synthetic shadow test; **ANT W1 ontology remains Undecided / Research Gap**. No mechanism or experiment is implemented in this pass.

## Decision and evidence boundary

Select a **retained local reference configuration**, represented by one signed plastic reference extension `p`, with a declared one-dimensional elastic–perfectly-plastic constitutive law. Its independent response is the reaction-force path and actuator work under a common displacement cycle. The next pass asks whether this particular model has a testable, history-dependent response after all existing environmental inputs are matched. It does not ask whether ANT has already formed this material.

This is a deliberately introduced modeling hypothesis. The archives supply no local strain, calibrated stress, plastic offset or independent measurement of this response. A successful synthetic test would establish modeled discrimination and a correct implementation of the declared law; it would not establish natural formation, a coherent Plate, physical plasticity in ANT, or the necessity of this ontology.

The [formation design gate](w1-material-formation-design-gate.md) remains in force: **formation dynamics**, **historical provenance** and **geometry/object compilation** are distinct. This proposal tests a constitutive state change in an already defined local element. It creates no material mass, birth event, bond network, geometry or object compiler.

The verified evidence supports the following limited conclusions:

- [SurfaceField retention](evidence/2026-10-10-w1-post-contact-field-retention-audit/README.md) is exactly reproduced by production relaxation and FOOT_CONTACT deposition. Persistence by itself does not identify an extra material process.
- [Archived chemical-memory recurrence](evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check/README.md) reproduces all `16,561,152` Float32 values byte-identically from archived chemical input and the production sampler/EMA. This is archive-internal numerical consistency. The [original runner provenance gap](evidence/2026-10-10-w1-archived-replay-runner-provenance-recovery/README.md) and same-update capture timing remain unresolved; the earlier sufficiency audit stays Inconclusive / Blocked.
- Episode closure, activity connectivity and accumulated admission do not identify an independent material birth. Different recorded histories alone are insufficient; the archives contain no independent new W1 constitutive-response channel.
- Production already implements [TrailPlateBirth](../../src/lib/agents/ant/TrailPlateBirth.js) and [MaterialStratigraphy](../../src/lib/agents/ant/MaterialStratigraphy.js), material descriptors and [surface physical response](../../src/lib/audio/SurfaceAudioBridge.js). The unresolved issue is the new long-term W1 ontology, not the absence of material or sound in ANT. Existing descriptor formulas and audio remain frozen.

`world-model.md` is a future contract. Main's older vitality-first roadmap is historical; the branch's [2026-10-08 material-before-vitality decision](daily/2026-10-08-w1-material-before-vitality.md) governs this investigation. Neither ordering establishes material physics.

## Candidate comparison

| Explanation | Support in current code/evidence | Additional assumption and minimal test | Decision here |
| --- | --- | --- | --- |
| Existing fields with a memoryless constitutive readout | Exact observed SurfaceField and archive-internal chemical recurrence; existing production material responses | Complete relevant state and future input must be controlled. A response difference could still arise from an omitted field, neighbor, solver state or forcing | Keep as explanatory null; current evidence does not refute it |
| Dose/consolidation scalar mapped to response coefficients | W1 has contact/field history summaries, but no independently measured consolidation property | A conversion law and response mapping would both be new. Renaming an EMA or contact count and assigning stiffness does not discriminate material | Do not select |
| Retained local reference configuration `p` | No ANT strain or plastic-offset observation supports it; constitutive precedent provides an explicit operational law | One signed state, mechanical loading history, fixed shared coefficients, and an energy-accounted force response. Reset and frozen-state controls are available | Select only for synthetic feasibility |
| Retained inter-cell bond relation | Activity adjacency exists; retained mechanical bonds do not | Requires an independent bond-creation/break law and force law. Reusing activity edges risks historical chaining; joining cells to get geometry adds an ungrounded selection rule | Defer; too many unsettled choices for this gate |
| Hysteretic field regime | Existing fields already retain history; no observed extra branch state | If the branch is determined by current fields it is a readout. If it is independent, it needs a state law and independent response just as `p` does | Remains possible; no evidence selects it |

The reference-configuration candidate is chosen for explicit falsifiability and fewer unspecified relations, not because it is physically or artistically preferable. A spring in series with an ideal friction slider is a standard one-dimensional elastic–perfectly-plastic model: elastic deformation unloads while the slider position retains configuration. This supplies a constitutive precedent, not ANT calibration. [Applied Mechanics, Plasticity](https://mechanics.ju.se/SolidMechanics/Plasticity.html). General plasticity formulations also distinguish elastic/plastic deformation and elastic unloading; adopting them is a modeling choice. [LS-DYNA computational plasticity](https://www.dynasupport.com/tutorial/computational-plasticity).

## One material state and its constitutive law

Use one fixed local element with externally prescribed signed extension `x`. `x` is boundary forcing, not another added dynamical state. The sole retained state is signed reference extension `p`, initially zero. Let `k > 0` be the common elastic coefficient, `Y > 0` the common yield force, and `e_y = Y/k`. These coefficients are shared across both histories and comparators. They are not functions of a history score, chemical field, ant ID or desired morphology; no ANT value or audible response scale is selected.

Declare the stored elastic energy and actuator-on-element reaction sign convention:

```text
Psi(x,p) = (k/2) (x-p)^2
F(x,p)   = k(x-p)                 # force needed to maintain prescribed x
|F| <= Y                         # admissible elastic force
```

For each monotone segment of imposed displacement, the endpoint update is:

```text
F_trial = k (x_new - p_old)
F_new   = clamp(F_trial, -Y, Y)
p_new   = x_new - F_new/k
```

Below yield, `p_new = p_old`. Loading beyond yield changes the reference extension; unloading is elastic until the opposite yield boundary is reached. Path reversals must be supplied as separate segments. Work integration must split at the yield intersection; endpoint clamping alone cannot recover the force path or its work.

This is a rate-independent dissipative flow law, not a threshold applied to existing ANT signals. The yield force is an explicit uncalibrated constitutive assumption, not an observed formation threshold. For a monotone yielding segment, dissipation is `D = Y |Delta p| >= 0`; summing segments gives `W = integral F dx = Delta Psi + D`. `p` can reverse or decrease: irreversibility means dissipative flow, not a monotonic history score. `Psi`, force and the accumulated work ledger are derived diagnostics, not additional material state.

With no imposed loading, `p` remains, including when there are no agents. Bounded imposed extension gives bounded reference extension (`|p| <= |x| + e_y` after an update) and bounded reaction `|F| <= Y`. Time alone causes neither growth nor burial. This satisfies a local persistent-world assumption without claiming that production advances while paused.

The existing environmental values do not determine `p` in this proposed model: two loading histories may end at the same `x` and identical full environmental state with different `p`. Knowing the entire imposed loading history and the law can reconstruct it. Being reconstructible from history does not make it an instantaneous field summary. The additional state is needed for a Markov description of **this assumed constitutive law**, not yet proven necessary for ANT.

There is no automatic FOOT_CONTACT-to-strain connection. Archived contact/compaction values do not establish local displacement, work, yield force or retained configuration. Connecting them to `p` would require a separately justified loading law and separately authorized shadow pass; it is outside the executable test below.

## Matched-state discrimination and its limit

Let `E` include every existing input/state that the selected response can depend on, rather than a few approximately matched scalar samples. In a deterministic field-only model, identical `E`, boundary/solver initialization and future forcing imply identical future response. The witness deliberately isolates a quasistatic element to make that statement testable.

| Quantity | Required control in the synthetic witness |
| --- | --- |
| Chemical/Pheromone, chemicalMemory and SurfaceField | Exact full-array copies and equal metadata/configuration; frozen during the probe. No sampling gate or approximate scalar matching |
| Spatial surroundings | Same fixed one-element boundary and no coupled neighbor elements. Entire field grids, not only one cell, are identical; no spatial interpolation input can differ |
| Agents, contacts and delayed inputs | Absent in both models; no RNG, movement, deposition, pending contact/event queue or controller update |
| Existing Plate/stratigraphy/audio state | Not instantiated in either witness; no production solver, buried material, audio worklet or hidden oscillator participates |
| Mechanical conditions | Same element geometry, `k`, `Y`, prescribed `x = 0` at probe start, segment ordering and displacement path. No inertia, velocity state, damping, temperature, aging or hardening |
| Deliberately retained difference | `p`, and therefore its dependent initial stress and elastic energy, in model B only |

Freezing `E` is an explicit synthetic intervention, not a claim that natural histories reach the same full state. Identical all-zero fixture arrays are sufficient because the constitutive witness does not use them. Both formation histories are imposed mechanical paths disconnected from ANT field dynamics. This proves neither a natural matched pair nor an effect on a running ANT world. A future coupled test must re-enumerate its full relevant state and inputs; merely matching chemicalMemory/SurfaceField scalars is inadequate.

**Prestress limit:** different `p` at the same `x,k` necessarily gives different initial reaction and stored elastic energy. Initial stress cannot also be matched in this one-state witness. The independent response must therefore extend beyond that offset, and include a frozen-`p` control that retains the same prestress. This test cannot demonstrate a different small-signal stiffness at equal prestress. Same future forcing means the same displacement-controlled actuator path; reaction force is the measured output, not another input constrained to equality.

## Histories, baseline and independent response

For `0 < b < 1` and `0 < c < 1`, prepare:

```text
H0: x = 0 -> b e_y -> 0       => p = 0
H1: x = 0 -> (1+c)e_y -> 0   => p = c e_y
```

H1 unloads without reverse yielding and begins the probe with reaction `-cY`. Preparation work is outside the probe ledger. Both preparations receive the identical `E` fixture at the probe boundary.

**A, field-only comparator:** the same element with no retained offset and a current-input response `F_A = clamp(kx, -Y, Y)`. It uses the same coefficients/force limit; no hidden history or formation label may enter the probe. On the prescribed probe below it is simply `kx`. This is a declared common shadow readout, not a claim that production implements this elastic element or that all possible field-only laws are elastic.

**B, retained-state candidate:** the same coefficients/forcing plus the `p` update above. Direct reading, plotting or coloring of `p` is not an acceptance response.

Use the common probe:

```text
x = 0 -> -a e_y -> 0, with 1-c < a < 1
```

The primary independent observable is the **force–displacement path and its signed probe work `W = integral F dx`**, measured from imposed displacement and reaction. Report `F(x)-F(0)` alongside the absolute force to separate offset from branch changes. Predictions derived from the declared law:

| Probe result | A, either history | B after H0 | B after H1 |
| --- | --- | --- | --- |
| Initial reaction | `0` | `0` | `-cY` (insufficient evidence alone) |
| Outbound negative yield | None on this probe | None | At `x = (c-1)e_y` |
| Signed work `W/(Y^2/k)` | `0` | `0` | `(a+c-1)[1-(c+1-a)/2] > 0` |
| Endpoint `p/e_y` (internal diagnostic only) | Absent | `0` | `1-a` |

For B/H1, `Delta Psi/(Y^2/k) = [(1-a)^2-c^2]/2` and `D/(Y^2/k) = a+c-1`. The cycle returns `x` to zero but does not close the internal state; `W = Delta Psi + D`. **Do not label probe work or plotted loop area as pure dissipation.** The initial energy change must be accounted for. A conservative memoryless force law has zero work on this closed one-dimensional displacement path, even if its force is nonlinear or offset.

Three necessary controls use the same candidate, not additional formation mechanisms:

1. **Reset ablation:** after H1 and before the probe, reset `p` to zero. Record the reset's energy change outside the probe ledger. The subsequent force path/work must match H0 and A; never silently reset during the probe.
2. **Frozen-state prestress control:** after H1, hold `p = c e_y` fixed through the probe and measure the affine elastic force `k(x-p)`. This diagnostic intentionally disables yielding and can exceed `Y`; it is not an admissible production material. It preserves initial stress/energy but has zero closed-path work, demonstrating that a static offset alone is insufficient.
3. **Subyield negative control:** choose `0 < r < 1-c` and probe `0 -> -r e_y -> 0`. A and both B preparations have the same baseline-subtracted tangent `k` and zero work. Different starting offsets are allowed. A tiny linear-response test alone cannot detect this candidate.

## Counterarguments and unresolved conditions

- **“This is environmental memory renamed.”** `p` also remembers history, but its operational meaning is a reference configuration in an energy/flow law. Its future reaction follows that law, rather than an arbitrary display or coefficient mapping. Terminology alone cannot settle whether to store it in an environmental field or a material object. Adding `p` to an environmental grid is still an additional constitutive degree of freedom; the distinguishing issue is predictive state, not class ownership.
- **“Any history can be assigned a response.”** Correct. Here the chosen response and energy accounting constrain the same update law before execution, and reset/frozen-state controls test causality within it. They do not validate the artistic assumption in ANT. `k,Y` remain assumed shared constants; history changes configuration rather than assigned stiffness, mass, resonance or damping.
- **“Fields alone could explain it.”** An omitted field, viscoelastic internal variable, frictional boundary, changed prestress, different neighbor or unequal forcing can explain a response difference. The synthetic controls exclude these by construction. A field-only law with an explicit prior-history input could emulate `p`, but then the relevant predictive state is no longer only the declared current fields. This witness rejects only the scoped memoryless comparator; it does not eliminate every possible physical or field-based explanation.
- **“A positive synthetic result proves material birth.”** It does not. The element already exists, preparation is externally imposed, and no natural formation channel is specified. Mass creation, bond topology, spatial coherence, geometry compilation and eventual sounding-body dynamics remain separate research gaps.
- **“This predicts different sound.”** No. It predicts quasistatic constitutive reaction under a yielding probe. Its unchanged subyield tangent supplies a counterexample to automatically inferring different resonance or timbre. No vibration, audibility or DSP conclusion follows.

## Next executable pass: one isolated synthetic witness

**Execution is deferred to a separately requested pass.** Implement only the reference-offset law and the comparisons above, detached from `AntController`, `TrailPlateBirth`, renderer, physical audio and production imports that create resources.

Suggested scope is one pure shadow module/CLI, `scripts/ant-w1-retained-reference-shadow.js`, and one focused test, `tests/ant-w1-retained-reference-shadow.test.js`. This names proposed files, not existing implementation. Inputs are the piecewise-monotone displacement knots, shared positive `k,Y`, initial `p`, and control mode. Return the reaction trace and work ledger; state diagnostics must not enter the response acceptance calculation. Reject nonfinite inputs, nonpositive coefficients and inadmissible live-candidate initial states (`|k(x-p)| > Y`); an implicit initial projection would introduce an unreported intervention.

Use the symbolic inequalities above as the specification. For one deterministic unit fixture, `k = Y = 1` is a nondimensional unit convention, not ANT calibration; `b = c = 1/2`, `a = 3/4`, `r = 1/4` are exact rational witnesses of those inequalities. They are neither fitted formation thresholds nor a required material-response size. No sweep or amplitude search is needed. The analytic family, controls and invariants govern acceptance, not a chosen numeric magnitude. For this fixture, the predicted H1 probe work is `5/32`, elastic-energy change `-3/32` and dissipation `1/4`; these are predictions, not measurements in this pass.

The follow-up runner must:

1. Prepare H0/H1 with the same law, then clone the identical environment and probe boundary. Record exact array/config equality (hashes plus direct equality), forcing knots, coefficients, source HEAD and source-file SHA-256. No archive or natural replay is needed.
2. Run A and B under the shared probe, followed by reset, frozen-state and subyield controls. Reset ledgers per probe and disclose each intervention. No state-to-visual/audio adapter is allowed.
3. Integrate each elastic/yield segment exactly at its intersection and reversal. Compare with an independently derived piecewise formula, not only the same endpoint updater used twice. Verify `|F| <= Y` for the live candidate, elastic holds, signed reversal, nonnegative dissipation and `W = Delta Psi + D`. The frozen-state diagnostic is explicitly excluded from the yield-bound invariant.
4. Check a subdivision of the same monotone path to detect endpoint-only integration artifacts; no parameter sweep. The exact dyadic fixture permits exact expected values. Any further floating-point tolerance must derive from arithmetic error bounds, not from a minimum visually or acoustically preferred response.
5. Write force/displacement/work results, diagnostics, comparison classifications and reproduction commands only after execution. A new evidence package then records inputs, source hashes, validation and limitations; existing evidence is untouched.

Record reaction branches/yield intersections, baseline-subtracted force, signed `W`, `Delta Psi`, `D`, energy-balance residual, equality checks and reset/frozen/subyield parity. `p` is recorded only to diagnose the updater and boundary conditions. Work and reaction must be calculated from the forcing and constitutive force, rather than generated from the expected `p` or expected verdict.

| Result | Interpretation in that future pass |
| --- | --- |
| Supported | The declared B law produces the predicted branch/work difference under matched controls, energy accounts balance, and reset/frozen/subyield controls behave as predicted. Supports this synthetic model's discriminability only; W1 ontology remains undecided |
| Mixed | Only an offset or partial diagnostic is reported. This describes incomplete observation, not a valid completed witness: missing controls or branch/work/energy checks must be completed before acceptance. No ANT material conclusion |
| Negative | No empirical Negative verdict is available from this stipulated synthetic law: its matched histories and inequalities force a difference. A missing predicted difference fails the specification/implementation check, not the ANT ontology. Empirical rejection would require a later independently justified loading/response observation contradicting the law, or showing that complete existing state already predicts it; that experiment is not specified or authorized here |
| Inconclusive | Environmental/forcing matching, source provenance, integration, sign convention or energy accounting fails. A programming mismatch against the analytical law is an implementation/specification failure to repair, not evidence against ANT material formation |

The inequalities guarantee a difference **if the proposed law is imposed correctly**. A completed synthetic gate therefore supports modeled consistency or remains unaccepted because of incomplete/failed verification; it cannot produce an empirical ontology verdict. This executable pass does not select plasticity over another ANT ontology. Even a perfect pass leaves the harder falsifiable ANT question open: is there an independently justified local loading/configuration channel and a response that the complete existing-world state cannot predict? Without that channel or an external observation, model A and B are not empirically selectable from present archives.

## Implementation and verification boundary

This pass changes documentation only. No actual response experiment, numerical prototype, parameter selection for ANT or new evidence package is performed. The three frozen seed archives are retained as prior negative/comparison evidence; they are unnecessary for the isolated synthetic law and cannot reveal an unimplemented state's effect. They may become relevant to a later separately justified contact-loading test, with the runner provenance caveat preserved.

Before these edits, all **18** entries in the latest recurrence package ledger and **26** entries in its frozen-input fingerprint list matched both byte size and SHA-256, including frozen three-seed files and production sources. This verifies the referenced files against their recorded ledgers, not the missing archived runner execution. The package ledger also hashes the then-current ANT hub: its historical hub hash is preserved as the `d59eaa9` snapshot, not rewritten after this documentation update. Algebraic predictions were independently reviewed; they were not numerically executed.

Formation law adoption, natural ANT loading, geometry/birth criteria, spatial coupling and any response affecting organisms or audio require separate evidence and authorization. Production movement, chemical/SurfaceField, FOOT_CONTACT, existing Plate/stratigraphy/audio, W2/vitality and main remain unchanged. Persistent-world semantics and formation-history-derived character remain constraints, not success claims.

Process and documentation verification: [2026-10-11 chronology](daily/2026-10-11-w1-material-response-discrimination-design.md).
