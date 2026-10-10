# ANT_2026 — Repo / Commit Handoff

**기준일:** 2026-10-07

---

## 1. 최근 production / evidence commit 흐름

### Contact sonic baseline

```text
bdbe60f397391864b078c37d659a4b33eeaa3f4a
finite pulse + local mechanical recovery

7f8ebf8d50752341383d1bd3d90e568fc2340fdd
Chrome A/B audio + evidence
```

### Plate decay

```text
9069a3e943c85e11e60f0038df2336ef4d1e360d
Plate damping change

51f576061991745858429749a034c9ea586ac318
decay evidence
```

### Runtime re-check

```text
3a41e6be6784de71e290ff3f6475416ceaeeb883
natural runtime re-check evidence
```

### Dormant Plate ROM feasibility

```text
2d2d654
Add dormant Plate reduced-order feasibility harness

ecf09c7
Record dormant Plate reduction feasibility evidence
```

### Founder refinement

```text
596555d47a4c27f8c6c5e0076bfeda95af512618
Refine low-evidence ANT exploration

f19681a5f86e620a1c3dd8cedad113806323d45d
Add founder-effect evidence harnesses

e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9
Record founder-effect refinement evidence
```

마지막 보고 기준:

```text
origin/main = e38450ce...
tracked working tree clean
```

단, 실제 다음 작업 시작 시 반드시 다시 확인.

---

## 2. preserved untracked diagnostic

기존 세션부터 다음 파일이 untracked로 보존돼 있었음:

```text
scripts/ant-target-energy-wake-gate-validation.js
```

또는 동일 목적의 wake-gate diagnostic script.

주의:

- Candidate A stateless wake gate 검증용.
- production truth 아님.
- Candidate A는 unsafe로 판정.
- 파일을 실수로 production commit에 포함하지 말 것.
- 삭제/overwrite 전에 목적 확인.

---

## 3. 다음 세션 시작 Git 체크리스트

반드시 먼저:

```text
git status
git diff
git branch -vv
git log --oneline --decorate --graph --all -n 30
```

확인할 것:

- current HEAD
- origin/main
- local-only commits
- untracked wake-gate script
- unrelated partial work
- evidence-only commits와 production commits 구분

---

## 4. commit policy

새 pass에서도 목적별 분리.

S0/S1 권장 예:

```text
1. Add read-only ANT dynamic social graph
2. Add temporal social topology analysis
3. Add ANT social graph evidence harness
4. Record ANT social graph baseline evidence
```

원칙:

- generated evidence를 core production commit에 섞지 않음.
- S0/S1을 억지로 쪼개서 intermediate commit을 broken state로 만들지는 않음.
- commit 전에 diff 확인.
- stage 범위 확인.
- validation 뒤 push.
- unrelated/untracked 파일 보존.

---

## 5. 다음 pass에서 production invariance 확인

DynamicSocialGraph는 read-only여야 하므로, enabled/disabled 비교에서 가능한 한 다음이 동일해야 함:

```text
initial RNG state
movement state / trajectory hash
pheromone state
FOOT_CONTACT stream
SurfaceField
Plate births
population timeline
```

graph instrumentation이 RNG를 새로 소비하면 안 됨.

---

## 6. known deferred issue

Audio runtime:

```text
mature 20–30 Plate
→ AudioWorklet render clock collapse
```

당분간:

- production optimization하지 않음.
- wake gate 되살리지 않음.
- modal ROM 되살리지 않음.
- S0/S1과 섞지 않음.

향후 다시 열 때는 별도 runtime branch/pass로 격리하는 것이 안전.