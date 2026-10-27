# Independent review — contact-history causal readout

**Verdict: no blockers found.** Review was read-only against the final pre-commit research tree. The reviewer inspected the canonical ANT README, registered plan, report, data, runner, helper, test, and daily record.

## Findings

- Independently recomputed support count, valid count, valid ratio, unique destination pixels, same-pixel count, and median separation for all seven transforms from the saved per-contact rows. All summaries match `preflight.json` and the README table.
- The registered denominator is 760 display-supported source routes. Best candidate `reflect-x` supports 354 relocated placements (46.58%), below the 90% capture threshold. Stopping before artist-facing capture is supported.
- The helper now compares each filtered target with its own source pixel. The regression test covers a prior unsupported contact before a supported contact.
- Replay parity claims match the saved 1,052/1,052 H1 anchors, event digest, and RNG record. The report distinguishes these checks from renderer parity.
- No candidate media or artist response exists. The report makes no perceptual claim and limits the negative result to this relocation family and H1 scene.
- Production `src/` has no diff from the stated main SHA.

## Review limits

The reviewer did not rerun the simulation, test suite, or build. Glyph appearance, rendered-mark counts, and artistic interpretation remain unmeasured because the comparison stopped at geometry preflight.
