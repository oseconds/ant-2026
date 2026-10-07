# Repository guidance

- For ANT work, start with `docs/ant/README.md`. Use `docs/ant/evidence/` for experiment evidence and `docs/ant/daily/` for chronology.
- For generic String/Plate/Sphere or shared library work, start with `docs/physical-audio-lab.md`.
- For work spanning ANT and shared audio, read the relevant sections of both guides.
- The root `README.md` is the public project overview. Consult it when project-level context is useful, but do not treat it as the canonical ANT implementation guide.
- Before resuming work, inspect `git status`, `git diff` and recent commits. Preserve valid partial/untracked work; never absorb unrelated files into a pass.
- For every ANT implementation or research pass, invoke the `caveman` skill at the start of the task when it is installed. This is mandatory, not optional. If `caveman` is unavailable in the current harness, state that explicitly before proceeding. Keep user-visible progress and decision narration concise and evidence-focused; never expose private chain-of-thought, and do not let narration replace source inspection, tests, verification or explicit evidence/commit boundaries.
- Work one ANT experiment at a time and prefer small, falsifiable passes. Do not tune behavior merely to manufacture a desired visual/social pattern.
- Keep ANT behavior framework-independent. `AntController` coordinates systems; behavior/fields/material logic stay out of the renderer. `AntRenderer` only draws snapshots. Browser/audio resources are not created at module top-level.
- The founder-refined behavior baseline is frozen at `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9`. Preserve movement, steering, gait, collision, pheromone, SurfaceField, recruitment and Plate-birth qualification unless fixing a demonstrated bug.
- S0/S1 read-only social observation is complete; the latest implementation/evidence baseline is `af9c417ac9993a24cbebd42a9248fb99f14a8f2c`. `DynamicSocialGraph` / `TemporalSocialTopology` must remain observers: no RNG consumption, steering callback, AntAgent social state or automatic controller/renderer feedback.
- Current social evidence does **not** demonstrate persistent pioneer behavior or social roles. The next research gate is movement-constrained null validation. Do not proceed automatically to λ₂/eigenmodes, adaptive social memory, social feedback or graph→Plate coupling.
- Keep `TrailPlateBirth` focused on immutable births and `MaterialStratigraphy` on mutable exposure/depth. Depth comes from later overlapping material, never age alone. Ordinary feet directly excite only exposed top material; buried material receives energy through coupling.
- Preserve the current sonic baseline: 3 ms finite contact pulse, 75 ms local recovery and ×50 Plate damping. Mature 20–30 Plate AudioWorklet realtime collapse remains a known deferred issue; do not mix runtime optimization into unrelated ANT passes.
- Optional Base Substrate support is integrated on `main` but remains default Off. Candidate D `.015` is calibration evidence, not an adopted production balance. Subjective listening found D too dominant and the current substrate too metallic/long-tailed; isolate the next audio pass to timbre/material character (duller, sand-like, granular/noisy, shorter ringing) before any new level calibration. Treat this as artistic/material interpretation, not biological evidence.
- Preserve historical evidence. Do not normalize, recolor, overwrite or fabricate natural milestones in committed evidence. Fixed-scale waveform/spectrogram comparisons must stay fixed-scale.
- New claims must distinguish implemented facts, descriptive observations, research-supported interpretation and artistic/modeling extensions. In particular, graph spectral modes are not established ant biological entities.
- After a pass, keep detailed measurements/reproduction in the relevant evidence package and record the process/decision chronology in `docs/ant/daily/`. Keep root README and this file concise rather than copying full experiment reports.

## Subagent 배분 메모

기본 모델은 **GPT-6 Luna**, 기본 reasoning은 **Medium**이다. 작업별로 필요한 수준을 고르고, spawn 시 `reasoning_effort`를 명시한다.

| Reasoning | 배정할 작업 |
| --- | --- |
| **Medium** | 기존 conventions·문서 조회, 단순 구현, 범위가 정해진 검증 |
| **High** | Scheduler 원인 추적·수리, race·clock 문제, 여러 시스템이 얽힌 구현·검증 |
| **Max** | 어려운 수학·과학·아키텍처 판단, 또는 clock mapping·PCM equality·증거 주장을 독립적으로 반대 검토할 때 실질적 이득이 큰 작업 |

High/Max가 더 깊은 분석·검증에 실질적 도움이 되면 적극 사용한다. 배정마다 작업의 불확실성·결합도·오류의 영향을 보고 수준을 선택하고, 짧게 선택 근거를 남긴다. 한 수준을 모든 작업에 관성적으로 적용하지 않는다. Max는 Medium/High 선행 시도 없이 바로 선택할 수 있다. 테스트 통과 결과만으로 더 깊은 검토가 불필요했다고 판단하지 않는다.
