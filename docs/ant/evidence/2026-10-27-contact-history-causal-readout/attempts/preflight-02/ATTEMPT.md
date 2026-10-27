# Preflight attempt 02

The full bounded H1 trajectory reached tick 6301. The runner checked every 6-tick prior anchor, but the reference set also includes an additional endpoint anchor at tick 6301, which is not divisible by six. The completeness assertion stopped the preflight after that omission was detected.

No candidate media was rendered. Correction: explicitly checkpoint the registered endpoint as well as every sixth tick, matching the reference anchor schedule. No simulation, relocation, glyph, or rendering rule changes.
