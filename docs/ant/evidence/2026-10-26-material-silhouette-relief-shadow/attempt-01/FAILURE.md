# Attempt 01 failure

The registered capture runner initialized the H1 world and rendered the five views at tick 0, then stopped while constructing the first packet. Its browser callback referenced `fullAfter` outside the loop scope where it was declared, raising `ReferenceError: fullAfter is not defined` before the packet was submitted to the media writers.

No simulation tick advanced, no PNG was persisted, and no encoded video frame was written. The empty `video/` and `stills/` output directories are preserved here with the exact executed runner source. The artist did not inspect candidate output. The fixed matrix, rendering values, support rule, state stream and endpoint are unchanged; only the runner's before/after fingerprint bookkeeping will be repaired for one repeat.
