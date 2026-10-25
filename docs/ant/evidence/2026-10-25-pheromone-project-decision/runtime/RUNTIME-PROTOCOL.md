# Pheromone project runtime screen protocol

Status: preregistered before runtime-runner implementation and browser measurement. This is a feasibility screen for the single already-qualified candidate G; it is not an adoption or full-duration runtime gate.

## Comparison

- Arms: C = production `PheromoneField` at 96×96; G = production Gaussian field at 316×316 with only the authored point and segment dose scaled by `3969/361` before storage. G retains the same Gaussian writer, cap 8, 15 s half-life, bilinear sampling, and all other field behavior. No third arm or new mechanism.
- Same deterministic seed: `20261005`, same controller defaults and 28-agent initial population target. No separate parameter, seed, or duration sweep.
- Audio is disabled (`audioBridge: null`, born-surface mode, base substrate Off). Both arms use the same actual `AntRenderer` with default display options.
- One foreground Chrome page per arm, sequential C then G, with no other benchmark running. Browser viewport 1280×1000, canvas 900×900 CSS pixels and device scale factor 1.
- Record actual Chrome version, OS/hardware facts available from the browser/host, source and runner SHA-256 values, page visibility, thrown errors, initial/final ant and Plate counts, and heap samples where Chrome exposes them.

## Run procedure

1. Start the same Vite dev server and headed Playwright Chromium/Chrome configuration for each arm. Record the exact command and browser version. Do not silently substitute headless if headed Chrome is unavailable.
2. Build the controller and renderer, then warm the controller with 600 simulation seconds by calling its production `tick(1/60)` method 36,000 times while no rendering occurs. Report warm-up wall time separately. Reset the controller's frame timestamp/accumulator before timed RAF capture. This warm-up is not a 600 s wall-clock run and is not a regenerated natural 600 s evidence run.
3. For at least 60 s of measured wall time, use actual `requestAnimationFrame` callbacks. On each callback call production `controller.update(timestamp)`, obtain the production controller snapshot, and call `renderer.render(snapshot, { time: timestamp })`. Preserve real RAF cadence and production 100 ms update clamp. End only after elapsed wall time reaches 60 s.
4. Report observed wall duration and simulation-clock advance separately, including discarded time implied by the 100 ms frame-gap clamp. Record RAF FPS and frame interval p50/p95/p99, update-call/frame cost, snapshot cost, render call-return cost, and renderer redraw completion cost if it can be observed without changing renderer semantics. State explicitly that p5 `redraw()` can schedule work asynchronously; invocation latency is not paint completion.
5. Report focused field timings for production field decay, detached field snapshot/copy, full controller snapshot, and the writer calls observed in the run (point/segment counts and aggregate duration). These wrappers are diagnostic instrumentation and their latency is not uninstrumented production latency. Keep them distinct from the whole-run frame/clock result.
6. Report browser heap snapshots/samples only where the browser exposes them. Record absent metrics as unavailable. Preserve raw per-frame/per-call output, errors, source hashes, and the focused-test log; do not discard failed attempts.

## Interpretation boundary

This one-seed, 600-s warm-up plus >=60-s actual-wall RAF screen can identify obvious clock loss or a practical cost concern in the tested browser/session. It cannot establish hours-long stability, population-wide behavior, visual quality, hardware-general performance, or adoption readiness. Do not introduce a result-dependent pass threshold. No concentration/pathology analysis is part of this screen. The previous Node-only runtime timings are context only and are not browser evidence.
