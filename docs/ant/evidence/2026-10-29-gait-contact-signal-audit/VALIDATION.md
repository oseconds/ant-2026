# Validation

## Provenance and parity

- Production authority `main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `86308a9cc8bdb067ecabd33465e127d9d453164d`.
- Fresh `git ls-remote` at pass start confirmed `origin/main` and the traffic parent branch at those SHAs; the target gait-contact branch did not yet exist remotely.
- Frozen history packet commit/path: `0d5096a920e1ebb2086fa1dae782c5d4e871b590` / `docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz`.
- Frozen packet SHA-256: `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc` (17,766,995 bytes).
- Frozen contact-input SHA-256: recorded by `analysis.json`; the input contains the ordered raw P2 prefix and exact P1/P2 `C_surface` arrays, selected-I node sets and edge lists.
- Frozen parity-anchor SHA-256: `65a2fa65a25c04ff75ebceb1e6381f0153f13aa2ce088f31e5f267eee96003f5`.
- All 11 production ANT source hashes in the frozen packet matched the current workspace/main blobs. `AntController.js`, `GaitController.js`, `SurfaceField.js`, `TrailPlateBirth.js` and `MaterialStratigraphy.js` are checked individually by the runner.
- The five source files above have no diff against `origin/main`; no production source was changed in this pass.
- P1 exact contact-window digest: `30a6f5c250d0dabd1d01231dfd902396c7fd7f637acae5436742ce5940d070ab`.
- P2 exact contact-window digest: `7391f2db8b47f7a9dbb181031d8dbf9c7576e05dab1da5f9a5a12094333f61e4`.
- Ordered contact prefix through P2: 3,655 groups / 10,849 feet, SHA-256 `19bb340be61cf74a8e868d541df11e3b57e8e7427092eb89dd125f52b3de8eaf`.
- Commit `C_surface` map hashes match the existing parity receipt for P1 and P2.
- P1/P2 birth times remain `84016.66666666823 ms` and `106016.66666667463 ms`; the frozen packet's commit anchors are unchanged.

## Performed checks

- Reconstructed the compact input from the pinned packet and verified the source packet SHA before writing it. The original 17.77 MB packet is read from its Git blob, not copied into this package. To rerun the extraction check in PowerShell:

  ```powershell
  git show 0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz > $env:TEMP\ant-gait-contact-history.json.gz
  node scripts/extract-ant-gait-contact-signal-input.js $env:TEMP\ant-gait-contact-history.json.gz --check
  ```

  The extractor verifies the compact input byte-for-byte without overwriting it; it also verifies both event-window digests, the complete through-P2 contact-prefix digest and exact P1/P2 SurfaceField map hashes against existing anchors. Its optional write mode uses exclusive file creation and refuses to replace an existing input.
- Ran `node scripts/ant-gait-contact-signal-audit.js`. It verifies all 11 source hashes, exact event windows and contact digests, accepted-foot totals, the fixed tripod/leg mapping, per-ant strength invariance and exact frozen endpoint arrays before producing measurements.
- Ran `node scripts/ant-gait-contact-signal-audit.js --check` to rerun the measurement and compare `analysis.json`, `data/measurements.json.gz` and `atlas.html` byte-for-byte.
- Atlas data are generated from the same measured contact rows and maps. P1/P2 use the same world coordinate mapping, window-count, cumulative-count and revisit display scales, and a fixed 0–1 SurfaceField scale. The selected-I overlay is optional context and has no measurement role.
- Static atlas-data checks parsed its embedded JSON and compared every contact/map/scaffold value to `data/measurements.json.gz`; event totals, count-map sums, cumulative count-map sums and displayed layer definitions matched the quantitative report.
- `hash-manifest.json` records package and daily-record SHA-256 values; it excludes itself.

Headless Chromium launch was attempted for a pixel-level browser check but the environment denied process creation (`spawn EPERM`). The in-app browser also rejected the local `file:` URL under its URL policy. No alternate browser route was used; browser-rendered pixels were not independently inspected.

No simulation replay or RNG-consuming operation was run in this pass. No production behavior, event schedule, field, material state or commit timing was changed. No full repository build/test, extra seed, 600-second run, audio render/listening, body mask, prototype, or material law was performed.

## Limits

The frozen contact stream preserves touchdown time, ant ID, tripod, leg, raw foot point, centroid and event strength. It does not preserve every ant's full tick trajectory, gait phase or pose in the P1/P2 windows. Therefore the fixed-gait comparison verifies the source-defined leg/tripod pattern and observed alternation, but does not estimate a trajectory-conditioned residual. The same-seed P1/P2 pair does not establish generality across seeds or material relevance.
