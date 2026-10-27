# Failed compositor acquisition (preserved, not review material)

This first completed acquisition is invalid for artistic review. It used the original offscreen smooth-baseline raster followed by a second composite pass, which changed composite pixels outside material support. The four milestone comparisons counted 4,368 outside-support pixels in each of View 3 and View 4 before the first Plate (the material support was empty), 0 per view immediately after birth, 2 per view at +15 s, and 0 per view at +30 s. The capture's summed diagnostic counter was 8,740. Zero-signal changes were 0. The issue was resampling/compositing, not mask spill or simulation divergence.

The 4 bounded videos were 640×640, 351-frame lossless files, totaling 143,655,737 bytes. Their SHA-256 receipt, frame map, capture metadata, and measurements are retained in this directory. The invalid media binaries and stills were removed to keep the final evidence package compact. No one used these files for artistic review.

The registered view parameters were not changed. Before the valid recapture, the renderer was amended to draw the production baseline directly and replace only weighted native pixels inside the material support. See the parent evidence package's `PLAN.md` and `SOURCE-AUDIT.md` for that amendment.


A later pre-capture comparison also found per-canvas raster differences outside an empty mask even with equal mapped source image bytes and context state. View 3 differed by 3,418 pixels from View 2 on separate canvases; toggling both modes on one canvas produced zero differences in that isolated check. Follow-up captures exposed additional full-composite differences under the conditioned readback path with empty material support (234 pixels, then 4,330 pixels in separate failed runs). These were not valid candidate outputs.

The final acquisition uses one renderer/canvas, a transparent material-slot placeholder, and a View 2 `material-control` readback/write that is pixel-identical to production. It verifies the pheromone layer without agents on every sampled frame: both conditioned views have zero changed pixels outside support and at zero-signal locations. The final native media is in the parent package, not this failed-attempt folder. Full-composite View 1 raster differences from the prior separate-canvas package remain separately documented there.
