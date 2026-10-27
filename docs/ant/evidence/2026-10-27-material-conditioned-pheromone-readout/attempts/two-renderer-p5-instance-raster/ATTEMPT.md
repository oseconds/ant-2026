# Invalid acquisition — separate p5 renderer instances

This bounded H1 capture is preserved as a technical failure, not artist-review material. The media SHA-256 receipt is [`MEDIA-SHA256.json`](MEDIA-SHA256.json). Exact PNG parity failed for View 1 at +15 s and +30 s; pre-Plate and immediate post-Plate matched byte-for-byte.

The decoded +15 s comparison changed 22,800 RGB pixels (maximum channel delta 86); +30 s changed 23,020 RGB pixels (maximum channel delta 91). Difference images show the changes on ant strokes. At pre-Plate, where material support was empty, separate View 1 and View 2 canvases differed at 8,276 RGB pixels on ant strokes. The same-state H1 stream was preserved, but independent p5 contexts introduced ant raster variation between candidate views.

The final capture uses one renderer/canvas for all four views, keeping within-matrix p5 context shared. Its empty-support pre-Plate View 1/2 images are pixel-identical. Compared with the prior separate-canvas reference capture, the final shared-renderer View 1 differs at all four milestones; see the final `capture.json` and README for pixel counts and the separate exact H1 frame/RNG parity. Do not describe the prior-reference raster comparison as byte-exact or as ant-only. This capture was not reviewed by the artist.
