# Repository guidance

- For ANT work, start with `docs/ant/README.md`. Use `docs/ant/evidence/` for experiment evidence and `docs/ant/daily/` for chronology.
- Treat `docs/ant/archive/**` as excluded, superseded history: do **not** open, search, index, summarize, cite, or load this path during normal ANT tasks (including broad repo discovery, `rg`/glob scans, onboarding, research and next-pass planning). Exclude it from ordinary searches with `--glob '!docs/ant/archive/**'` or an equivalent filter. Access it only when the user explicitly requests historical/provenance comparison or archive maintenance; label any findings historical and never treat them as current implementation or roadmap. `docs/ant/daily/` and `docs/ant/evidence/` remain normal sources.
- For future ANT world-loop architecture, also read `docs/ant/world-model.md`. It is a design contract, not current implementation. Preserve the persistent-world framing: agent presence is not the existence condition of the world; no prescribed destination/global reward by default; state/feedback changes conditions rather than commanding routes; material character must derive from formation history rather than arbitrary presets; the world is the target sounding body; no direct internal-state sonification or master-output feedback; exceptional entities are allowed but influence must remain finite/bounded; add only one new causal link per pass.
- For generic String/Plate/Sphere or shared library work, start with `docs/physical-audio-lab.md`.
- For work spanning ANT and shared audio, read the relevant sections of both guides.
- The root `README.md` is the public project overview. Consult it when project-level context is useful, but do not treat it as the canonical ANT implementation guide.
- Before resuming work, inspect `git status`, `git diff` and recent commits. Preserve valid partial/untracked work; never absorb unrelated files into a pass.
- For every ANT implementation or research pass, the parent invokes the `caveman` skill at the start of the task when it is installed. This is mandatory, not optional. If `caveman` is unavailable in the current harness, state that explicitly before proceeding. Keep user-visible progress and decision narration concise and evidence-focused; never expose private chain-of-thought, and do not let narration replace source inspection, tests, verification or explicit evidence/commit boundaries.
- Work one ANT experiment at a time and prefer small, falsifiable passes. Do not tune behavior merely to manufacture a desired visual/social pattern.
- Keep ANT behavior framework-independent. `AntController` coordinates systems; behavior/fields/material logic stay out of the renderer. `AntRenderer` only draws snapshots. Browser/audio resources are not created at module top-level.
- The founder-refined behavior baseline is frozen at `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9`. Preserve movement, steering, gait, collision, pheromone, SurfaceField, recruitment and Plate-birth qualification unless fixing a demonstrated bug.
- S0–S2c social observation/validation is complete and parked as a read-only diagnostic baseline. `DynamicSocialGraph` / `TemporalSocialTopology` must remain observers: no RNG consumption, steering callback, AntAgent social state or automatic controller/renderer feedback.
- Current social evidence does **not** demonstrate persistent pioneer behavior or social roles. S2a/S2b/S2c are complete and the current decision is **spectral SKIP**; do not escalate automatically to λ₂/eigenmodes, adaptive social memory, social feedback or graph→Plate coupling. Preserve the current no-relationship social archives/evidence as a frozen comparison baseline. If a future pass explicitly introduces relationship, partner-memory or other social mechanisms, compare them against this baseline under matched seeds/observer definitions before making a social-effect claim.
- Keep `TrailPlateBirth` focused on immutable births and `MaterialStratigraphy` on mutable exposure/depth. Depth comes from later overlapping material, never age alone. Ordinary feet directly excite only exposed top material; buried material receives energy through coupling.
- Preserve the current sonic baseline: 3 ms finite contact pulse, 75 ms local recovery and ×50 Plate damping. Mature 20–30 Plate AudioWorklet realtime collapse remains a known deferred issue; do not mix runtime optimization into unrelated ANT passes.
- Optional Base Substrate support is integrated on `main` but remains default Off. Preserve B/C/D calibration evidence, but do not assume a separate always-present base plate is part of the target world model. Current conceptual direction is `world itself = sounding body`; do not resume substrate ratio/timbre tuning as an architecture requirement unless explicitly authorized.
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

역할(구현 / 실험·증거 수집 / 독립 검토)과 reasoning 수준은 따로 선택한다. 위임마다 `역할 / reasoning / 선택 근거 / 수정 범위 / 완료 기준`을 짧게 명시한다. 역할별 지침은 반복 복사나 경계 누락이 생길 때만 별도 파일로 분리하고, 공통 규칙은 이 파일에 유지한다.

Parent는 작업에 맞춰 subagent의 반환 보고 형식·길이를 정한다. 단순 탐색·검증은 결론·파일 위치·검증 상태를 간결하게, 연구·설계·독립 검토는 근거·반례·불확실성을 충분히 보고하게 한다. Subagent에 대한 `caveman` 적용은 필요할 때만 지시하며 일괄 강제하지 않는다.

### 재사용과 새 배정

- 같은 범위·같은 artifact의 후속 수정과 연속 확인에는 기존 agent를 재사용할 수 있다.
- 주제·역할·핵심 전제 또는 필요한 모델/reasoning이 달라지면 새 agent로 배정한다.
- 최종 수용 판단이나 자기 작업·조언에 대한 **독립 검토**는 새 agent에 맡긴다. 현재 소스·증거·제약·완료 기준을 전달하고, 이전 결론과 대화 이력은 최소화한다.
- 재사용할 때도 현재 commit·변경 범위·완료 기준을 갱신하고, 바뀐 소스와 증거를 다시 읽게 한다. 이전 통과 판정을 그대로 이어받지 않는다.
- 경과 시간·호출 횟수보다 작업 경계와 검토 독립성으로 판단한다. 중요한 근거를 놓치거나 오래된 전제가 현재 범위와 충돌하면 새로 배정한다.
