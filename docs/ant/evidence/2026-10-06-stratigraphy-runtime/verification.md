# Stratigraphy runtime verification

Date: 2026-10-06 (Asia/Seoul)

## Results

- Final `npm test`: passed, 227 tests; 0 failures, 0 skipped. Node reported 3,432.1 ms. The earlier 225-test run preceded two evidence-helper tests for complete ten-second windows and actual zoom pixel rendering. ANT/app/DSP source is unchanged since the successful build and browser checks.
- `npm run build`: passed with Vite 6.4.3; production bundle emitted. Existing dependency annotation and large-chunk advisories were printed; no build error.
- `npm run test:browser` with `BROWSER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`: passed in Vite development mode.
- `CHECK_PRODUCTION=1 npm run test:browser` with the same Chrome path: passed against the production preview.
- `node scripts/stratigraphy-regression-freeze.js`: passed; 17 protected source files identical to baseline `d281d341f5abe68ff98ca4cbf837838c7b7b45a2`; no changes in either historical evidence directory.

## Browser lifecycle coverage

The real Chrome smoke check confirms the ANT environmental worklet receives the compiled topology protocol v1 on Audio On, including 96-cell source grid, 32-cell solver grid, explicit 256-layer ceiling, and no pre-birth nodes or fabricated birth/strike messages. It checks ANT → Plate → ANT and ANT → Sphere → ANT transitions, verifies the shared AudioContext is reused, the prior environmental worklet closes without post-close messages, and returning to ANT requires a fresh Audio On gesture. Both development and production preview runs passed.

## Verification limits

These automated checks establish browser lifecycle and protocol behavior. They do not establish human listening quality or the visual procession criterion. Chrome was installed at the configured path. Build output included existing non-fatal dependency annotation and bundle-size warnings.

## Retained final-run browser artifacts

The actual Chrome screenshots and paired metrics from `test-results` are preserved here as `browser-dev-ant.png` / `browser-dev-metrics.json` and `browser-production-ant.png` / `browser-production-metrics.json`. Their source screenshots were written at 2026-10-06 14:13:27 and 14:14:17 Asia/Seoul. The development screenshot shows live ANT at 35% Volume. The production browser-check screenshot shows live ANT at 100% Volume; its paired metrics report 30 approximate simulated seconds, one shared context and no processor errors. These are browser lifecycle smoke-check screenshots. They are not the required 35%-Volume synchronized stereo audio capture with waveform and spectrogram.

`build.stdout.txt`, `browser-dev.stdout.txt`, and `browser-production.stdout.txt` preserve the successful command output returned by the terminal tool. The commands were not originally redirected to files, so these are saved copies of the captured stdout, not raw shell transcript files. Build duration reported by Vite was 3.25 s; the production-preview build during the browser check reported 2.46 s. Both builds had the same non-fatal dependency annotation and large-chunk warnings. Browser output reported success in both modes, with no errors.
