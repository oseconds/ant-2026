# Browser runtime screen results

Protocol: [RUNTIME-PROTOCOL.md](RUNTIME-PROTOCOL.md). This is one fixed-seed browser screen of C then G, each after a 600 simulation-second tick warm-up and for at least 60 seconds of visible foreground RAF. Runs use separate fresh browser pages and the same seed/configuration; once the fields change movement, later states are not a matched same-history replay.

## Environment and clock

- Chrome `156.0.8078.48` (headed); Windows `10.0.19045`, x64, Intel Core i5-13600KF, 20 logical CPUs.
- Both pages stayed visible and reported no page errors. Browser heap had 60 samples per run. C peaked at 61.5 MB and ended at 38.6 MB; G peaked at 91.5 MB and ended at 83.9 MB. These are Chrome JS-heap samples, not total browser-process memory.
- C: 60,005 ms wall, 60,000 ms simulation advance, 3,425 measured frames, 57.08 FPS, frame interval p50/p95/p99 17.5/18.1/18.1 ms; no accepted RAF interval exceeded the controller's 100 ms clamp.
- G: 60,017 ms wall, 60,017 ms simulation advance, 3,425 measured frames, 57.07 FPS, frame interval p50/p95/p99 17.5/18.1/18.1 ms; no accepted RAF interval exceeded the clamp.
- Clamp loss computed from recorded accepted frame intervals as `sum(max(0, intervalMs - 100))` was 0 ms in both runs. The raw JSON's `discardedByClampMs` is an older wall-minus-simulation estimate (C 5.0 ms; G 0.6 ms) that also includes startup/endpoint timing and tick quantization; it is not clamp loss and must not be used for that claim.

## Cost and evolving state

All per-function values below come from timer wrappers and are instrumentation-affected diagnostic costs. Whole-run RAF/frame-clock timing includes those wrappers. Nested costs overlap: controller snapshot includes the field snapshot, and controller update includes field decay.

| Measurement | C (96×96) | G (316×316) |
| --- | ---: | ---: |
| 600 sim-second warm-up wall time | 6.90 s | 10.35 s |
| `controller.update` total / per call | 1,199.9 ms / 0.350 ms | 1,593.8 ms / 0.465 ms |
| `controller.getSnapshot` total / per call | 388.7 ms / 0.114 ms | 868.1 ms / 0.253 ms |
| Detached field snapshot total / per call | 72.3 ms / 0.021 ms | 549.3 ms / 0.160 ms |
| Field decay total / per call | 38.5 ms / 0.011 ms | 358.7 ms / 0.100 ms |
| Point-writer calls / wrapped duration | 10,619 / 11.2 ms | 11,200 / 18.9 ms |
| Segment-writer calls | 0 | 0 |
| Renderer `render()` call mean / p95 / p99 | 0.010 / 0.100 / 0.100 ms | 0.010 / 0.100 / 0.100 ms |
| p5 draw callback total / count / max | 7,424 ms / 3,426 / 37.9 ms | 10,318 ms / 3,426 / 40.8 ms |
| Ant count after warm-up → end | 21 → 22 | 17 → 23 |
| Plate count after warm-up → end | 35 → 39 | 41 → 45 |

The main descriptive result is that this G implementation incurred higher diagnostic field/snapshot/update cost and browser heap use, while both runs maintained nearly identical RAF cadence and simulation-clock advance in this 60-second session. The G-specific warmth and later population differ because this same-seed comparison runs the two fields independently and their behavior diverges; it is not a paired-state performance estimate. These results support a bounded runtime feasibility screen only, not hours-long stability, other hardware, visual quality, or adoption.

## API and evidence limits

The G shim intentionally preserves the existing operational writer returns: `depositPoint()` returns the scaled requested amount (`3969/361 × A`), and segment deposition likewise uses the scaled amount-per-distance. Storage remains capped and can accept less than either return; the return is not a measure of accepted uncapped interior dose after cap saturation. The current controller ignores these return values. No public return contract was changed in this screen.

No concentration/pathology analysis was run. No full natural 600-second wall-time run, broad test suite, build, or visual-quality review was performed. Existing Node-only runtime numbers were not used as browser evidence.

## Reproduction and receipts

From repository root, run these sequentially in a headed Chrome-capable environment:

```powershell
node scripts/ant-pheromone-project-runtime.js --arm C
node scripts/ant-pheromone-project-runtime.js --arm G
node --test --experimental-test-isolation=none tests/ant-g-runtime-field.test.js
```

Raw per-frame and browser metrics are in [runtime-C.json](runtime-C.json) and [runtime-G.json](runtime-G.json); each stores the Chrome version and SHA-256 values for the controller, field, agent, deposition, Plate-birth, renderer, G shim, and runner. The runner asserts those source hashes remain unchanged during each arm. The focused test output is losslessly archived in [focused-test.log.gz](focused-test.log.gz). Default Node test isolation failed with `spawn EPERM` in this environment; the failed output is preserved in [focused-test-default-isolation-failure.log.gz](focused-test-default-isolation-failure.log.gz), and the same test passed in single-process isolation. Local uncompressed logs are preserved but ignored by Git.
