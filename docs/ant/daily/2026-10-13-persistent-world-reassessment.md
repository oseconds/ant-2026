# 2026-10-13 — Current persistent-world architecture reassessment

## Question and authorized scope

현재 production과 2026-10-13까지의 evidence를 바탕으로 persistent-world를 재평가한다. 이전 roadmap의 다음 항목은 실행하지 않고, 구현 사실, experiment-supported property, authored law, future hypothesis를 구분한다. 새 production mechanism, tuning, 장기 campaign, Nodule extension은 금지한다. Branch/worktree는 inventory만 수행하고 삭제하지 않는다.

## Baseline and Git boundary

시작 HEAD: `75e53df2ec0d025b4337e360e48829f5c58809ab`, clean working tree. Fetch한 local/remote main: `b14de91b91db5e818a8128090e7c442259ddd257`. Direct-child 관계이며 production diff가 없음을 확인했다.

사용자의 명시적 지시에 따라 expected-old SHA를 지정한 `git update-ref`로 main을 fast-forward했다. `git push origin main` 뒤 live `ls-remote`에서 `75e53df`를 확인했다. Merge commit/rebase/cherry-pick을 만들지 않고 `codex/ant-persistent-world-reassessment-20261013`을 생성했다. Synthesis만 이 branch에 commit/push하고 main에 추가 통합하거나 PR을 만들지 않는다.

첫 `git fetch`는 sandbox의 `.git/FETCH_HEAD` 쓰기 제한으로 실패했다. 허용된 escalated 실행은 성공했다. Hygiene 하위 agent의 non-escalated remote 확인은 Schannel 오류로 실패했지만 parent의 live 전체 heads 확인은 성공했다. 실패한 호출을 remote drift로 해석하지 않는다.

## Investigation and decision changes

Parent는 저장소 지침에 따라 `caveman`을 적용했다. Production state/timescales, forced-zero/Nodule, complete-state null/대안, audio path, Git hygiene를 read-only로 나누어 조사했다. Luna High는 source 간 연결/시간 순서/ancestry에, Max는 state 필요성과 반례 판단에 사용했다. Fresh final acceptance review는 별도의 새 Max agent에 요청했다.

Current guides, production code, retained exposure, locomotion A/B/adoption, causal tail, pre-cohort, zero-ant continuity, Plate lineage, Nodule lineage/censoring/instrumentation 및 관련 daily를 읽었다. Archive는 열지 않았고 source/evidence 근거로 사용하지 않았다. Windows에서 첫 targeted filename discovery의 제외 glob이 archive 이름도 나열해 이후 `!**/archive/**`를 추가했다. 나열된 archive는 열거나 내용을 검색·인용하지 않았다.

중요한 수정 사항은 movement의 chemical/contact 두 경로와 기존 material character였다. Plate의 meanChemical/meanSupport→stiffness/density/damping, Nodule의 compaction/layers/load→material/radius/coupling 경로를 compiler/worklet까지 추적했다. Canonical의 “history-derived variable character 미구현”은 범위가 지나치게 넓어 richer episode/order-sensitive law 미구현으로 한정했다.

첫 후보인 “material 값이 solver 응답을 바꾸는가”는 current canonical Plate-decay package의 기존 synthetic damping-range check와 중복됨을 확인했다. Endpoint 0.25/0.45의 T60 차이는 이미 기록되어 있었다. Proposal은 native accepted descriptor의 effective variation/opportunity로 좁히고, 필요한 경우에만 단일 요인의 matched attribution을 검토한다. Synthetic 민감도를 자연 형성의 variance/salience와 동일시하지 않는다.

Nodule 최신 결과는 arm당 32 cells 중 최종 27개 censoring / 5개 compaction loss였다. 실제 mature nearby rejection 6건은 restart 뒤 최종 censoring으로 끝났으므로 추가 failure로 더하지 않는다. Already-qualified cells의 gap 중 birth 14건과 새로 Plate-enabled된 32 cells의 birth 0건도 구분했다. Targeted extension은 제한된 claim을 판별하는 데는 타당하지만 architecture priority는 secondary/PARK로 두었다.

Vitality는 complete-state restore 5/5와 기존 carrier로 SUFFICIENT CURRENTLY/PARK. Social은 S0–S2c frozen baseline을 유지하고 spectral SKIP으로 두었다. Natural vacancy, alternative formation, richer character, acoustic feedback에 새 state를 필수로 요구할 근거는 찾지 못했다. Current sound는 world output으로 유효하며 vibration-to-condition-to-behavior는 미구현 design 후보로 남겼다.

## Git hygiene

모든 refs와 5개 worktrees를 점검하고 [inventory](../2026-10-13-repo-hygiene-map.md)에 full SHA/date, main ancestry, unique commits, upstream relation, local/remote-only, dirty/missing 상태를 기록했다. Main fast-forward 뒤 snapshot은 local 23 / 실제 remote 26 heads였다. Synthesis push로 remote는 27개가 된다.

Local 11 / remote 13 refs가 현재 safe-delete 후보이다. 완료된 clean worktrees 세 개는 제거 후보지만 ignored files를 아직 inventory하지 않아 실제 삭제 전에 재확인해야 한다. Shadow worktree 하나는 untracked path 3개가 있어 BLOCKED다. W1/rejected candidate/remote-only test commits는 보존한다. 삭제, prune, remove는 실행하지 않는다.

## Independent review and validation

Fresh independent Luna Max review: **PASS — no blocking findings**. Reviewer는 현재 source/evidence와 문서·canonical diff를 다시 읽고 `git status` / `git diff --check`를 확인했다. Tests/build/simulation은 rerun하지 않았다.

검토 중 W1의 오래된 pause note를 현재 활동 상태로 표현한 점과 primary worktree의 clean-start / documentation-in-progress 구분이 지적되었다. W1은 검증된 33 unique commits와 현재 활동 미확인에 따라 REVIEW BEFORE DELETE로 수정했다. Branch DO NOT TOUCH와 worktree BLOCKED는 별도 분류임을 명시했다. Fresh reviewer가 수정본을 재확인했다.

Reviewer는 forced-shadow/natural 경계, 14 already-qualified births와 새 32 cells의 0 births 구분, 27 censoring /5 compaction loss와 6 secondary rejection 집계, sampled timer/reset, complete-state null, 기존 material-character path와 synthetic damping E의 범위를 확인했다. Old roadmap 복원이나 새 state를 먼저 정당화한 주장은 발견하지 않았다.

수용 가능한 결론은 native character의 effective range/response를 확인하는 **조건부 attribution 조사**다. Richer character/vitality/climate의 필요성이나 작품적 중요성을 입증하는 제안은 아니다. 자연 변이가 없으면 matched audio 비교도 생략한다. 비차단 권고: 후속 contrast 선택 기준, response threshold/window를 결과 전에 고정한다.

이번 작업은 documentation-only다. Parent 확인: 새 artifact의 local links 54개 존재, Markdown table header/separator column 수 일치, saved 3seed JSON을 다시 집계해 두 arm 모두 RIGHT20 /RESET7 /COMPACTION5=32, production/src/static/scripts/tests/package/AGENTS diff 없음, `git diff --check` 통과. 기존 tests/build/simulation/listening 결과는 저장된 evidence의 결과이며 이번 pass에서 다시 실행하지 않았다. 새 causal evidence package를 만들지 않았다.

## Artifacts and stop boundary

- [Architecture synthesis](../2026-10-13-persistent-world-reassessment.md)
- [Repo hygiene map](../2026-10-13-repo-hygiene-map.md)
- Minimal canonical corrections: ANT README/world-model + daily index

Branch: `codex/ant-persistent-world-reassessment-20261013`. Publication commit은 Git history에서 확인한다. 이 pass는 synthesis/inspection을 commit/push하고 종료하며, 제안된 다음 pass는 실행하지 않는다.
