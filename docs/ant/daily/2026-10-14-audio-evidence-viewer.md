# 2026-10-14 — reusable static A/B audio evidence viewer

Added a versioned JSON config and static viewer generator for repeated ANT A/B listening, local subjective notes and optional fixed-scale ERB reveal. The natural-event package now uses its existing q25/q50/q75 WAVs and listening manifest as the first integration.

The viewer reuses the established 30-band ERB helper and records input WAV and output HTML hashes. No simulation, audio render, human listening result or scientific measurement was added. Existing **MIXED** decision remains unchanged; production sources remain untouched.

Evidence: [viewer schema and usage](../audio-evidence-viewer.md) · [natural-event viewer and validation](../evidence/2026-10-14-base-born-natural-event-erb/README.md).
