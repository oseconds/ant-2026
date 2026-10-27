# Capture runner corrections

The first harness attempts exposed implementation and encoding issues before the registered A/B capture was accepted:

- Added cleanup for the temporary observer after a preflight teardown error.
- Corrected the prior-evidence Git lookup used for replay anchoring.
- Loaded the Vite-transformed renderer module so its `p5` import resolved in the research harness.
- Added a module-script placeholder because the p5 friendly-error checker expects a script element.
- Made final parity evaluation compare the intended state hashes directly.
- Switched VP9 encoding to full-range yuv444p after a trial decode showed color-range conversion prevented byte-exact RGB comparison with the source PNGs.

These corrections affected only the harness, browser bootstrapping, or codec metadata. They did not change the registered glyph, assignment, simulation, renderer patch, or candidate images. The final capture was rerun with the registered conditions. No candidate media were artistically inspected before these technical corrections, and no candidate parameter was changed.
