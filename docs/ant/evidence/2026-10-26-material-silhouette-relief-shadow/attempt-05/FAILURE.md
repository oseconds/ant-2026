# Attempt 05 — metadata replay completed; review smoke timed out

The deterministic H1 replay reached tick 6301, matched the parent H1 frame-state/RNG trace, re-rendered all four milestones and byte-matched all 20 saved PNGs. ffprobe passed for all five saved videos and ffmpeg decoded each final video frame to RGB matching its saved endpoint still. Existing video/PNG hashes were not changed.

The review smoke then waited for metadata from all five hidden cached videos and exceeded Playwright's default 30 s timeout. This was a viewer loading inefficiency, not a media or simulation mismatch. The partial capture manifest (which includes world/milestone measurements and source hashes), exact runner and failure record are preserved here. The new viewer will load only the selected pair. A repeat is needed to persist the full frame map/manipulation record and complete review checks; it will still avoid video re-encoding.
