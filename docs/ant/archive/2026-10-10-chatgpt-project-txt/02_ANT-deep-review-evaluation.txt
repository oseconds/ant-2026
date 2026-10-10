응, **1회차는 꽤 잘 쓴 편이야.** 내 기준으로는 **8.5~9/10 정도**. 단순히 “관련 논문 많이 모아줬다”가 아니라 실제로 **우리 로드맵을 수정할 만큼 유효한 결론을 줬다**는 게 제일 컸어.

특히 좋았던 건 세 가지야. 첫째, 우리가 잡은 `read-only dynamic social graph` 방향을 ant-specific evidence로 꽤 탄탄하게 받쳐줬어. spatial fidelity와 movement heterogeneity만으로도 interaction topology가 생길 수 있고, temporal ordering을 버리면 connectivity/flow 해석이 달라질 수 있다는 걸 명확히 정리했지. fileciteturn52file0L4-L20 둘째, **weighted temporal graph를 첫 모델로 두라**는 권고가 아주 구체적이었고, generic proximity에는 directed edge를 쓰지 말라는 식으로 설계선까지 줬어. fileciteturn52file0L77-L85 셋째, 가장 값어치 있었던 건 **null model을 핵심 단계로 올려놓은 것**이야. 단순 random graph가 아니라 movement tendency, geometry, density를 보존하면서 synchrony/partner identity만 깨는 비교군을 요구했는데, 이건 우리가 “진짜 emergence냐 그냥 좌표 재포장인가”를 검증하는 데 딱 맞아. fileciteturn52file0L245-L263

그리고 예상보다 좋았던 부분이 **우리 아이디어를 무조건 밀어주지 않은 것**이야. bridge/pioneer는 가능하지만 “role”이나 기능적 중요성으로 과해석하지 말라고 했고, λ₂나 low-order eigenmode는 수학적으로는 유용해도 ant biology 쪽 직접 검증은 약하다고 선을 그었어. fileciteturn52file0L150-L173 실제로 결과표에서도 bridge-like individual은 Moderate, spectral mode는 Weak로 분류해놨고. fileciteturn52file0L292-L319 이 때문에 우리가 `S2 = Laplacian`에서 **S2 = null-model validation, spectral은 그 다음**으로 순서를 바꾼 건 꽤 좋은 수정이었다고 봐.

또 마지막 implementation recommendation이 실제 개발에 쓸 정도로 구체적이었어. `undirected weighted contact graph → event stream + overlapping windows → degree/components/merge-split/lifetime → persistent bridge/articulation → retrospective pioneer → parameter sweep → movement-constrained nulls`까지 거의 실험 프로토콜 형태로 나왔거든. fileciteturn52file0L376-L385

아쉬운 점도 있어. **정확한 numerical parameter를 주는 리뷰는 아니야.** 예를 들어 social radius 몇 body length, min duration 몇 ms, window를 몇 초로 해야 하는지는 결국 우리 데이터에서 sweep해야 해. 그리고 spectral/pioneer 쪽은 Review 스스로도 연구 공백이라고 인정해. 8페이지 표에서 spectral modes는 empirical tracking 1편 수준이고 behavioral validation은 사실상 비어 있어. fileciteturn52file0L337-L354 그래서 이걸 “논문에서 검증된 정답”으로 쓰면 안 되고, **실험 설계의 안전한 경계선**을 잡아준 리뷰라고 보는 게 맞아.

그래서 결과적으로는 **Deep Review 1회를 아깝게 쓴 건 전혀 아니고, 오히려 꽤 효율적으로 썼다**고 봐. 그냥 bibliography를 얻은 게 아니라:

```text id="1i8o07"
우리 초기 생각
dynamic graph → Laplacian → Plate

Deep Review 이후
dynamic graph
→ temporal observables
→ null-model validation
→ spectral only if useful
→ Plate
```

이렇게 실제 설계 순서를 더 단단하게 바꿔줬으니까.

그리고 중요한 점은 **1회차가 다음 2회의 질문을 더 좋게 만들어줬다**는 거야. 이제 #2는 막연히 social graph를 또 묻는 게 아니라, 실제 로그를 들고 “이게 density/movement보다 더 설명력이 있나?”를 물을 수 있고, #3는 살아남은 social metric만 들고 material coupling을 물을 수 있어. 그게 1회차의 제일 큰 수확 같아.