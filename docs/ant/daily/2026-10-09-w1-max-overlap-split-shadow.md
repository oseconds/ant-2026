# 2026-10-09 — W1 max-overlap split inheritance shadow

## 출발점과 단일 변경

`ant-w1-episodic-material-shadow`의 `73dac81d29231c40bc5dfecb1cd3f8ff34fc81e8`에서 이어갔다. [직전 continuity / closure 진단](2026-10-09-w1-continuity-diagnostic.md)은 동일 canonical identity를 공유하는 split descendants가 하나의 장기 pending lineage를 유지하는 구조를 확인했다. 이번 질문은 그 공유 liability를 제거하면 coherent local closure가 나오는가였다.

사용자가 승인한 후보 하나만 구현했다. 이전 spatial component의 동일-cell overlap이 가장 큰 자식 하나만 부모 identity를 계승한다. 동률은 기존 deterministic component order로 정한다. 나머지 overlap은 provenance만 남기고, winning parent가 없는 자식은 새 identity/clock/admission을 받는다. 부모의 누적 union을 복사하지 않는다. 먼저 전체 frame의 winner를 결정한 뒤 기존 minimum-ID merge를 실행하므로 split/merge 복합 상황에서도 다른 자식의 identity를 뒤늦게 redirect하지 않는다.

기존 q, 20/90 s EMA, active mask, 8-connectivity, 20 s persistence, inactive-owner closure, 실제 subsequent merge, frozen geometry, novelty, consolidation 및 run-start-through-close directional attribution은 고정했다. 기존 production/W1 source와 evidence는 수정하지 않았다. 새로운 factory와 분석·plot·검증 tooling만 별도로 추가했다. `caveman`을 시작 시 읽고 적용했다.

## Matched frozen replay와 검토

같은 archived seeds 20261005/06/07을 각각 599.25 s까지 읽었다. Natural ANT behavior를 재실행하지 않았다. Baseline 전체 분석은 committed causal-character evidence와 deep-equal이며, candidate 1,797개 프레임의 q input/active mask/EMA bounds/component count는 baseline과 정확히 일치한다. 원래 `analyzeSeed` 함수 본문을 그대로 재사용해 별도 character/geometry estimator를 만들지 않았다.

처음에는 한 장의 milestone overview가 너무 조밀해 읽기 어려웠다. 수치/selection을 바꾸지 않고 seed별 고정 world-scale 12-panel figure로 나눴다. Timeline의 active-cell 축과 episode/component-count 축도 분리했다. 완성된 geometry, timeline, character scatter를 직접 확인하고 독립 numerical/plot 재현을 대조했다. PNG/SVG는 production renderer와 분리된 분석 자료다.

## 관찰과 판단 — Mixed

| 599.25 s, baseline → candidate | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Frozen episodes | 108 → 201 | 115 → 205 | 105 → 211 |
| Frozen union cells | 187 → 755 | 186 → 690 | 154 → 797 |
| Largest frozen episode cells | 14 → 155 | 22 → 60 | 6 → 68 |
| One-cell episode count | 69 → 96 | 83 → 102 | 76 → 102 |
| One-cell fraction | 63.9% → 47.8% | 72.2% → 49.8% | 72.4% → 48.3% |
| Area-weighted re-inscription | 2.09% → 15.07% | 2.62% → 7.38% | 0.65% → 7.33% |
| ID-0 pending union share | 99.88% → 98.22% | 99.92% → 99.78% | 99.95% → 99.47% |

Fresh split 자식 92/88/104개가 부모에 재흡수되기 전에 독립 freeze했다. 기존 18-cell descriptive review scale의 isolated episode는 0/1/0에서 7/7/9로 늘었다. 실제 연결된 다중-cell 조각은 생겼지만, median episode area는 2 cells이고 단일-cell의 절대 수는 더 많다. 새 threshold나 morphology veto로 이 population을 정리하지 않았다.

**거대 pending은 해소되지 않았다.** Candidate ID 0은 birth부터 마지막까지 매 관찰 프레임에 하나의 active component를 갖는다. 583–585 s의 수명이 baseline과 같고, 누적 union은 6,061/5,958/6,068에서 5,960/5,936/6,031 cells로만 줄었다. Pending global union도 거의 같다. 새로운 identity가 늘어난 뒤 actual merge ancestry는 오히려 1,166/1,134/1,161개로 늘었다. 재흡수된 split 자식의 258/269/229개는 최종 pending ancestor에 들어갔다.

독립 검토 중 미래 후보의 근거를 더 명확히 하기 위해 기존 출력만 읽는 merge-core audit를 추가했다. ID 0이 직접 흡수하는 frame은 398/416/396개, source identity는 794/840/817개다. 총 1,210개 frame 중 다른 routed parent의 동일-cell overlap이 ID 0보다 큰 frame은 1/1/2개뿐이다. 따라서 minimum-ID를 max-overlap merge winner로 바꾸는 제안만으로 해결을 기대할 근거는 약하다. 연속 active core가 없어지는지 또는 merge가 없어도 살아남는지는 이번 pass에서 측정하지 않았다.

Frozen union의 실제 enclosed holes는 23/11/22개지만 최대 hole area는 5/4/5 cells다. Substantial frozen cycle은 없다. Isolated multi-cell material patch는 있으며, pending의 큰 hole은 frozen material로 세지 않는다. Artistic하게 일부 조각을 fossil-like/curved/irregular로 읽을 수 있으나 acceptance criteria는 아니다.

617/617 freeze의 character coverage는 완전하다. Consolidation mean/median은 .4793/.4667, directionalOrder는 .6298/.6474이며 pooled Pearson은 +.1813이다. 축은 하나의 size/duration proxy로 붕괴하지 않았다. 다만 carry-over로 형성된 새 one-cell identity 두 개는 새 admission-through-close chemical/mechanical samples가 모두 false여서 consolidation=0이다. 기존 EMA와 character 정의의 attribution 경계를 드러낸 결과 그대로 남겼다. Directional attribution의 stale/reused contact 한계와 미래 bounded-influence 위험도 유지된다.

개선된 독립 closure와 큰 조각, 악화된 절대 speckle/re-inscription, 그대로 남은 dense pending core를 함께 보고 **Mixed**로 판정했다. Frozen episode 증가만으로 Improved로 판정하지 않는다. W1 material ontology 및 W2 이후의 gate는 해결되지 않았다.

## 검증, 커밋 경계와 중단

- Focused 67/67, full `npm test` 359/359, `npm run build` 통과. 기존 Rollup annotation/chunk 경고는 비차단이다.
- Baseline 3-seed deep-equal, 모든 matched masks/EMA/component parity, one-owner invariant, deterministic split/merge ties, 독립 closure, union/admission 비복사, provenance, multi-hop absorption 및 causal-prefix fixtures 통과.
- Numerical 5개와 plot/manifest 15개, 총 20개 output이 독립 프로세스 재현에서 byte-identical.
- 과거 W1 evidence 138 files, protected source/config/fixture 63 files, 원래 production/config 46개 working hashes, 기존 copied frozen input 13개, natural archive 9개 보존 확인.
- RNG 호출 금지, future leakage 없음, finite/bounded character와 valid indices 확인. 추가 geometry filter, estimator, closure/qualification tune, second candidate 없음.

Tooling commit: `d1783c28a1be22272da44ede0ec8dc85c7c1ac28`. Evidence/chronology는 별도 commit으로 묶고 기존 shadow branch에 push한다. 최종 evidence commit 및 검증된 remote HEAD는 작업 보고에 남긴다.

다음 **설계 검토 후보 하나만** 제안한다: 현재 minimum-ID merge winner는 고정하고 다른 routed 부모의 과거 union/clock/closure liability 전달을 provenance로 분리한다. 이 가설은 reabsorption/history enlargement를 분리하지만, 계속 active인 core를 닫는 해결책이라는 증거는 없다. Losing identity의 종료 의미는 다음 독립 pass 전에 별도 contract가 필요하다. 이번에는 구현하거나 자동 실행하지 않는다.

[전체 evidence와 재현 명령](../evidence/2026-10-09-w1-max-overlap-split-shadow/README.md)을 보존하고 여기서 중단한다. Production, main, PR, vitality, material feedback, stratigraphy/audio와 acoustic climate로 진행하지 않는다.
