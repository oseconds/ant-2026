# Stratigraphy runtime verification

Date: 2026-10-06 (Asia/Seoul)

## Results

- `npm test`: passed, 225 tests; 0 failures, 0 skipped. Node reported 2,871.6 ms.
- `npm run build`: passed with Vite 6.4.3; production bundle emitted. Existing dependency annotation and large-chunk advisories were printed; no build error.
- `npm run test:browser` with `BROWSER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`: passed in Vite development mode.
- `CHECK_PRODUCTION=1 npm run test:browser` with the same Chrome path: passed against the production preview.
- `node scripts/stratigraphy-regression-freeze.js`: passed; 17 protected source files identical to baseline `d281d341f5abe68ff98ca4cbf837838c7b7b45a2`; no changes in either historical evidence directory.

## Browser lifecycle coverage

The real Chrome smoke check confirms the ANT environmental worklet receives the compiled topology protocol v1 on Audio On, including 96-cell source grid, 32-cell solver grid, explicit 256-layer ceiling, and no pre-birth nodes or fabricated birth/strike messages. It checks ANT → Plate → ANT and ANT → Sphere → ANT transitions, verifies the shared AudioContext is reused, the prior environmental worklet closes without post-close messages, and returning to ANT requires a fresh Audio On gesture. Both development and production preview runs passed.

## Verification limits

These automated checks establish browser lifecycle and protocol behavior. They do not establish human listening quality or the visual procession criterion. Chrome was installed at the configured path. Build output included existing non-fatal dependency annotation and bundle-size warnings.
