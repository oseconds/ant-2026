# ANT — Open-World Lifecycle / Population / World-Law Exploration

나는 `oseconds/ant-2026`에서 ANT라는 agent-based artwork/simulation을 개발하고 있다.

이번 질문은 현재 population controller의 숫자를 조절하는 문제가 아니다.

나는 ANT 전체를 다음 관점에서 다시 생각하고 싶다.

> **Canvas가 닫힌 arena가 아니라 더 큰 세계의 유한한 observation window라면, agents의 arrival / residence / departure / absence / return과 environmental memory는 어떤 법칙을 가져야 세계가 자연스럽게 살아 움직이고 순환할 수 있는가?**

현재 시스템을 최대한 정확히 설명하겠다.

이 정보를 출발점으로 삼되, **현재 구조를 보존해야 한다고 가정하지 마라.**

특히 최소 변경에 집착하지 말고, 필요하면 population target, recruitment, spawn provenance, outside-world model 자체를 과감하게 다시 설계해도 된다.

---

# 1. Artwork / system premise

ANT의 중요한 방향은 다음과 같다.

- 개미들이 명시적인 leader/caste/role 없이 autonomous하게 움직인다.
- agents는 environment보다 짧은 lifetime을 가진다.
- agents가 사라져도 environment history는 남는다.
- pheromone, mechanical history, material stratigraphy가 서로 다른 시간척도를 가진다.
- 실제 gait에서 발생한 FOOT_CONTACT가 mechanical history와 physical audio를 만든다.
- Plate라는 물질층은 한 번 materialization event가 commit되면 immutable하게 남는다.
- 이후 새로운 Plate가 같은 위치에 겹치면 새로운 layer가 된다.
- world는 agent보다 오래 산다.
- Audio는 population number를 소리로 매핑하는 것이 아니라 contact → material physical response에서 나온다.
- Audio Off에서도 movement/material history는 계속 진행한다.

중요한 artistic premise:

> **Canvas를 세계 전체로 보기보다 더 큰 열린 세계를 관측하는 유한한 창으로 보고 싶다.**

Boundary는 이상적으로 물리적 벽이나 semantic destination이 아니라 observation censor에 가깝다.

---

# 2. Current production authority

Repository:

`https://github.com/oseconds/ant-2026`

최근 확인된 production main:

`aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`

Actual production 판단은 `main`의 code + `docs/ant/README.md` + 최신 evidence를 기준으로 한다.

관련 source:

- `src/lib/agents/ant/AntController.js`
- `src/lib/agents/ant/ColonyActivation.js`
- `src/lib/agents/ant/AntAgent.js`
- `src/lib/agents/ant/PheromoneField.js`
- `src/lib/agents/ant/SurfaceField.js`
- `src/lib/agents/ant/TrailPlateBirth.js`
- `src/lib/agents/ant/MaterialStratigraphy.js`
- gait / FOOT_CONTACT source
- surface audio worklet

하지만 아래에 현재 중요한 구현 상태를 충분히 적는다.

---

# 3. Current agent arrival / population system

현재 configured population ceiling은 `28`.

하지만 production은 “28마리를 유지하는 시스템”이 아니다.

현재 `ColonyActivation`은 spawn origin 주변의 pheromone을 읽는다.

대략:

- origin `(0.5, 0.72)`
- sampling radii `[0.06, 0.09, 0.12]`
- 16 angular sectors
- strongest 4 sectors average
- pheromone response `v / (v + 0.04)`
- activation smoothing time constant `45 s`

Desired population:

```text
desiredPopulation = 8 + (28 - 8) * activation
```

Recruitment limit:

```text
floor(desiredPopulation)
```

현재 population이 limit보다 적으면 새 ant를 예약한다.

새 ant spawn:

- single small region centered `(0.5, 0.72)`
- radius `0.018`
- heading roughly north: `-π/2 ± 0.3`
- simulation-time cadence: approximately `400–900 ms`
- blocked spawn retry: `120 ms`
- one ant at a time
- no overdue batch release

Activation이 떨어져도 살아 있는 ants를 강제로 제거하지 않는다.

Ant는 open canvas boundary 밖으로 이동하면 retire된다.

Retired ant의 identity는 돌아오지 않는다.

새 ant는:

- new ID
- new personality
- new gait/behavior state

로 생성된다.

---

# 4. How this evolved historically

초기 shared-pheromone ANT는 `64 ants`를 canvas 전체에 처음부터 배치했다.

Commit `51362af2...`에서:

- 64 → 28 ants
- pheromone half-life
- deposition radius
- deposition amount
- sensing/reinforcement

등이 함께 변경됐다.

따라서 **28이라는 숫자 자체를 독립적으로 최적화한 evidence는 없다.**

Commit `22031ff9...`에서:

- one-ant start
- single entry region
- gradual spawn

으로 변경됐다.

그 후 open-boundary turnover가 추가됐다.

그 다음 `ColonyActivation`이 추가되면서:

- fixed replacement / fixed target

에서

- local pheromone activity에 따라 recruitment limit이 천천히 움직이는 system

으로 바뀌었다.

따라서 현재 `8 / 28 / 45 s / single entry / cadence`는 모두 historical design choices이며 자연 상수처럼 취급해서는 안 된다.

---

# 5. What the current late-run regime actually looks like

Current G production candidate의 600 s runs를 세 seed에서 봤다.

후반 `301–600 s` 대략:

| | seed A | seed B | seed C |
|---|---:|---:|---:|
| mean active population | ~19.99 | ~20.04 | ~20.01 |
| active range | 15–24 | 14–24 | 15–24 |
| successful arrivals / s | 1.477 | 1.417 | 1.480 |
| retirements / s | 1.483 | 1.413 | 1.480 |
| individual FOOT_CONTACT / s | 182 | 175 | 179 |
| new Plates in 300 s | 22 | 24 | 20 |
| zero-ant samples | 0 | 0 | 0 |

Nominal spawn cadence 평균은 약 `650 ms`, 즉 unrestricted라면 약 `1.54 arrivals/s`.

Current late-run population은 대략:

```text
mean active population
≈ arrival rate × mean residence time
```

으로 설명된다.

Observed values에서 inferred residence scale은 대략 `13.5–14.1 s`.

이것은 direct lifetime measurement가 아니라 flux balance approximation이다.

중요:

> **28이라는 ceiling보다 continuous arrival throughput + residence time이 current ~20-ant regime을 더 직접적으로 만든다.**

---

# 6. Important previous architectural diagnosis

최근 별도 review에서 다음을 이미 확인했다.

### Removing population target alone is not enough

현재와 비슷한 arrival rate를 population-blind stochastic process로 바꿔도:

```text
arrival ≈ 1.4–1.5 ants/s
residence ≈ 14 s
```

라면 평균 active population은 여전히 약 20이 된다.

즉:

> **population target 제거 ≠ natural circulation / quiet / absence**

다.

Constant external arrival은 그냥 다른 방식의 continuously busy stationary world가 될 수 있다.

독립 Poisson occupancy를 단순 예로 들면 mean occupancy가 20일 때 zero probability는 극도로 작다.

이것은 ANT prediction은 아니지만 중요한 conceptual counterexample이다.

---

# 7. Current world character

현재 ANT는 대략:

> **작은 유입구에서 agents가 계속 공급되고, 약 10여 초 머물다 관측창 밖으로 나가며, 그 동안 environment/material은 계속 누적되는 traffic world**

에 가깝다.

Agents는 순환한다.

Pheromone은 생겼다 사라진다.

Mechanical history는 훨씬 오래 남는다.

Material은 대부분 비가역적으로 축적된다.

따라서 다음을 구분해야 한다.

### Agent circulation
이미 존재한다.

### Activity circulation
아직 약하다. 세계 전체는 대부분 continuously active하다.

### Chemical circulation
이미 존재한다.

### Mechanical memory
매우 느리다.

### Material circulation
현재는 거의 없다. 주로 accumulation이다.

나는 모든 subsystem을 cyclic하게 만들 필요는 없다고 생각한다.

오히려:

```text
activity          comes and goes
chemical memory   fades
mechanical memory persists
material          accumulates
```

처럼 서로 다른 시간 화살이 있는 것이 ANT의 장점일 수도 있다.

---

# 8. Zero-ant capability already exists technically

`docs/ant/evidence/2026-10-12-zero-ant-continuity/`

에서 과거에 ants를 강제로 제거한 60 s diagnostic을 수행했다.

그동안:

- pheromone은 강하게 decay
- SurfaceField는 대부분 유지
- old Plate descriptors/layers remain
- formation clocks continue
- inherited history에서 일부 new Plate commit도 발생
- 이후 새 agents가 old material을 다시 경험

했다.

즉 architecture는 이미:

> **agents가 없어도 world가 진행되는 시간**

을 처리할 수 있다.

하지만 current production recruitment는 이런 상태를 자연스럽게 거의 허용하지 않는다.

Important:

나는 **zero-ant scene 자체를 만들기 위해 system을 설계하고 싶은 것이 아니다.**

궁금한 것은:

> agents가 떠난 뒤 environment 자체의 시간이 드러나는 상태가 자연 lifecycle의 일부가 될 가치가 있는가?

그리고 global zero가 아니라:

> 특정 장소가 버려지고 다른 장소로 activity가 이동하는 것

만으로 충분할 수도 있다.

---

# 9. Important environmental time scales

Current approximate scales:

```text
individual residence         ~14 s regime scale
pheromone half-life          15 s
Plate chemical memory        ~20 s
Plate candidate maturation   20 s
ColonyActivation tau         45 s
matched repeat gate          90 s + 30 new FOOT_CONTACT
SurfaceField half-life       ~1800 s
stratigraphy                 effectively permanent within session
audio vibration / sleep      separate physical dynamics
```

이 시간층의 차이를 중요하게 본다.

현재 continuous activity 때문에 일부 느린/quiet dynamics가 거의 체험되지 못하는 것은 아닌지 생각해달라.

---

# 10. Plate / material status

최근 Plate 연구에서 중요한 결론:

> **Plate는 path 자체가 아니라 materialization event가 commit한 finite immutable material layer로 보는 것이 유효하다.**

현재 authored temporal semantics:

- connection candidate
- maturation
- commit
- immutable descriptor
- reuse/repeat

는 생각보다 coherent해서 새 EVENT segmentation system을 만들 이유가 아직 없다.

Commit은 activity가 끝났다는 뜻이 아니다.

> **Commit closes the Plate descriptor, not the ongoing activity.**

따라서 lifecycle redesign 때문에 Plate temporal contract를 괜히 깨고 싶지는 않다.

하지만 arrival/lifecycle은:

- pheromone
- FOOT_CONTACT
- SurfaceField
- Plate event frequency
- repeat loading
- stratigraphic accumulation

에 강하게 영향을 준다.

---

# 11. Current material feedback

Accumulated material affects locomotion.

Current rule is bounded:

```text
m(L)=1 - 0.10*(1-exp(-L/4))
```

즉 maximum slowdown approximately 10%.

Material이 계속 쌓여도 agents가 자동으로 정지하거나 world가 쉬는 구조는 아니다.

오히려 slower travel은 residence time을 늘려 active population을 높일 수도 있다.

따라서 current material resistance 자체가 macro lifecycle circulation을 만들어줄 것이라 기대하면 안 된다.

하지만 material이 lifecycle에 완전히 passive해야 한다고도 미리 결론내리지 마라.

---

# 12. Audio

FOOT_CONTACT가 material을 strike한다.

따라서 current busy regime에서는 contact stream도 거의 계속 존재한다.

Potentially interesting temporal experience:

```text
dense contacts
→ thinning contacts
→ remaining material resonance
→ reduced/absent input
→ material tail / sleep
→ later new contacts on old layers
```

하지만 기존 zero-ant test는 Audio Off였다.

따라서 이것은 아직 perceptually validated artwork result가 아니다.

Audio lifecycle은 설계 판단에 포함하되, sound effect를 만들기 위해 population law를 억지로 만들지는 마라.

---

# 13. Open-world tension

현재 canvas boundary는 movement에는 open하다.

하지만 complete larger world는 simulation하지 않는다.

Outside:

- ants are not simulated
- IDs are not retained
- outside pheromone does not exist
- return trajectories do not exist

따라서 현재 world는 strict partial observation of a simulated larger environment라기보다:

> **open outflow window + abstract source**

에 가깝다.

이것은 반드시 나쁜 것은 아니다.

나는 거대한 hidden world simulation을 반드시 만들고 싶지는 않다.

Minimal outside-world abstraction이 더 좋을 수도 있다.

---

# 14. Single source coupling

Current `(0.5, 0.72)` region은 여러 역할에 얽혀 있다.

대략:

- ant arrival provenance
- recruitment sensing center
- founder condition
- route development origin
- current Plate source/root logic

이 역할들이 같은 장소에 묶여 있는 것이 좋은 coherence인지, accidental coupling인지 검토해달라.

하지만 단순히:

> “open world니까 edge spawn 여러 개”

라고 결론내리지 마라.

Single interior opening 자체도:

- underground entrance
- hidden passage
- local source

같은 coherent world interpretation을 가질 수 있다.

---

# 15. What I want from you

이제 current design을 감사하는 데서 멈추지 말고, **새 world architectures를 적극적으로 발명해달라.**

최소 수정안을 찾는 것이 목적이 아니다.

나는 오히려 다음을 알고 싶다.

> **현재 ANT가 가진 좋은 재료들을 사용한다면, 어떤 causal world laws가 activity를 실제로 나타나게 하고, 집중시키고, 약하게 하고, 다른 곳으로 이동시키고, 때로는 사라지게 하고, 나중에 다시 돌아오게 할 수 있는가?**

Crucially:

> **왜 activity가 감소하는가?**

그리고 동시에:

> **왜 다시 증가하는가?**

둘 다 설명해야 한다.

---

# 16. Avoid trivial answers

다음은 단독 해결책으로 충분하지 않다.

### Just remove population target

이미 충분하지 않을 가능성을 알고 있다.

### Constant random arrival

다른 busy equilibrium이 될 수 있다.

### Hidden sine wave

```text
arrival = sin(time)
```

같은 것은 원하는 natural circulation이 아니다.

### Hard scripted macro cycle

```text
busy 5 min
quiet 1 min
restart
```

같은 단순 timeline controller도 특별한 artistic reason이 없는 한 피하고 싶다.

### Rename the controller

desired population 대신 "outside activity level"이라는 scalar를 두고 똑같이 유지하는 것도 해결이 아니다.

---

# 17. But authored laws are allowed

반대로 “emergence”를 숭배할 필요도 없다.

ANT는 authored world다.

Biological realism이 목적이 아니다.

나는:

- simple
- causally understandable
- generative over long time
- compatible with environmental memory
- artistically meaningful

한 law를 원한다.

복잡한 pseudo-natural ecosystem보다 간단한 authored physics가 더 낫다면 그것을 선택해도 된다.

---

# 18. Explore mechanisms boldly

필요하면 다음 domain의 아이디어를 자유롭게 참고해라.

- open population systems
- source / sink dynamics
- immigration–death processes
- renewal processes
- self-exciting processes
- self-inhibiting processes
- refractory systems
- excitable media
- depletion / recovery
- finite reservoirs
- patch occupancy / colonization
- competing sources
- adaptation / fatigue
- ant recruitment biology
- ecological visitation
- dynamical systems

하지만 biological realism을 그대로 복제하지 마라.

Mechanism을 ANT world law로 번역하는 것이 목적이다.

---

# 19. Some architecture families I can imagine

These are only prompts, not requirements.

Feel free to reject all of them.

### A. Outside flux + local recruitment

External arrivals exist independently of inside population.

Local pheromone can increase or decrease that flux.

Question:

what makes activity eventually decline?

---

### B. Finite source / reservoir

A local entrance has finite available outside traffic.

Arrival depletes it.

It replenishes through another process.

Question:

can replenishment be causal without becoming a disguised timer?

---

### C. Excitable / refractory source

Local success initially recruits more activity.

After sustained activity, the source or environment becomes temporarily less responsive.

Later it recovers.

Question:

can this be linked to meaningful existing state rather than arbitrary fatigue?

---

### D. Spatially competing weak sources

No single entry owns the world.

Several weak sources can become locally reinforced and later lose dominance.

Activity could migrate spatially rather than globally stop.

Question:

does this create meaningful migration or merely more traffic?

---

### E. Environment-mediated visitation

Outside arrivals respond to the state of the observed patch itself.

Perhaps:

- fresh pheromone
- recent mechanical disturbance
- retained material
- novelty
- saturation

matters.

Question:

what causes attraction and what causes abandonment?

---

### F. Outside pool with real absence

A finite number of agents exist outside and inside.

Exit changes their state rather than destroying them.

Later return is possible.

Question:

does this add meaningful lifecycle causality or just hidden simulation complexity?

---

### G. Something completely different

I strongly encourage you to propose mechanisms I have not listed.

---

# 20. Important design criterion

For every serious architecture, draw the whole causal cycle.

For example:

```text
outside state
      ↓
arrival
      ↓
local activity
      ↓
environment changes
      ↓
future arrival changes
      ↓
activity declines / moves
      ↓
environment relaxes or persists
      ↓
later activity becomes possible
```

If a design cannot explain both:

- decline
- return

without an arbitrary restart timer, challenge it.

---

# 21. Think spatially, not only globally

I do not necessarily need:

```text
20 ants → 0 ants → 20 ants
```

A richer world may be:

```text
region A becomes active
→ A leaves strong history
→ traffic shifts toward B
→ A becomes locally quiet
→ chemical memory at A fades
→ material remains
→ much later activity returns to A under changed conditions
```

Global population may remain nonzero.

So consider:

- local abandonment
- spatial migration
- competing traffic regions
- different source dominance
- history-conditioned revisitation

as potentially more interesting than forced global breathing.

---

# 22. Think about long-run behavior

For each architecture ask:

What happens after:

- 2 minutes?
- 10 minutes?
- 1 hour?
- much longer?

Does it converge to:

- permanently busy traffic?
- permanent death?
- one dominant route forever?
- a noisy stationary state?
- intermittent activity?
- spatial migration?
- history-dependent renewal?
- eventual material saturation?

I am interested in a system that remains worth observing over time.

---

# 23. Material does not necessarily need to cycle

Current committed material is mostly permanent.

Do not automatically add erosion/removal because I asked for circulation.

A possible desirable structure is:

```text
agents      transient
pheromone   short memory
activity    migratory/intermittent
Surface     long memory
Plate       historical accumulation
```

This asymmetry may be more interesting than full ecological equilibrium.

But if permanent accumulation fundamentally kills long-run lifecycle richness, explain why.

---

# 24. Be willing to say a current subsystem is the obstacle

For example, you may conclude that:

- single entry is too dominant
- local pheromone recruitment creates irreversible self-maintenance
- current residence time is too short
- movement speed/canvas scale produces conveyor-like turnover
- permanent material eventually dominates
- Plate source/boundary semantics prevent real open-world interpretation
- active population gate is actually not the important problem
- another subsystem matters much more

I want this kind of structural criticism.

Do not protect the current design just because it is already implemented.

---

# 25. What I want as output

Please do a thoughtful architecture exploration, not a short answer.

First give your own diagnosis of the world.

Then propose approximately **3–5 genuinely different lifecycle architectures**.

For each architecture include:

1. core idea
2. causal diagram
3. what exists outside the canvas
4. why agents arrive
5. why activity increases
6. why activity decreases
7. why activity can return
8. whether global zero can occur
9. whether global zero matters
10. whether activity can migrate spatially
11. relationship with pheromone
12. relationship with SurfaceField
13. relationship with permanent Plate/stratigraphy
14. expected effect on audio
15. long-run regime
16. major failure mode
17. implementation complexity
18. what existing ANT strengths it preserves
19. what current systems it replaces/removes
20. one decisive experiment that could falsify it

---

# 26. Compare them aggressively

Do not make every candidate sound good.

Attack them.

For example:

- Is this just an oscillator in disguise?
- Will it converge to another stationary busy state?
- Will positive feedback lock permanently?
- Will negative feedback kill the world forever?
- Is recovery just an arbitrary timer?
- Does material eventually suppress everything?
- Does migration actually happen?
- Does it only alter population graph while spatial experience stays identical?
- Is the outside world more complicated than the visible world?
- Is this architecture worth its implementation cost?

---

# 27. Then synthesize

After exploring the candidates, tell me:

### Which architecture is the most promising for ANT?

Not necessarily the safest.

I am interested in the one with the strongest combination of:

- causal coherence
- long-term generativity
- compatibility with ANT's existing memory/material systems
- potential for surprising but understandable behavior
- spatial richness
- temporal richness
- audio consequence
- reasonable implementation complexity

Also identify:

### Which architecture is the most interesting risky experiment?

It can be more radical.

I am willing to test something that may fail if the experiment teaches us something important.

---

# 28. Experimental thinking

Do not immediately optimize parameters.

Suggest **structural experiments**.

A good experiment might deliberately exaggerate a mechanism.

Examples:

- remove population target completely
- make source depletion very strong
- create two competing sources
- disable local recruitment
- freeze outside supply
- allow source recovery only through environmental change
- create extreme refractory behavior
- let material affect visitation strongly in a shadow model

The purpose is not to find pretty tuning.

The purpose is to answer:

> **Does this mechanism actually create the causal behavior we think it creates?**

---

# 29. Important final framing

I am not asking:

> “How many ants should there be?”

I am asking:

> **“What kind of world is ANT, and why does activity pass through it the way it does?”**

And ultimately:

> **Can the environment genuinely outlive one wave of activity and become the condition for a later, different wave of activity?**

I want you to think expansively and architecturally.

Do not default to the minimum viable modification.

Use the current ANT system as rich raw material, not as a constraint that must remain intact.