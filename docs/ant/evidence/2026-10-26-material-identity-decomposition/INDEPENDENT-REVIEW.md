# Independent review and disposition

## Roles

- A GPT-6 Luna Max agent independently audited the pre-implementation controls. It identified p5 smoothing leakage, reset revision collisions, exposed Plate indexing, graph-node ordering and asynchronous redraw completion before candidate acquisition.
- A separate High agent implemented the pure texture helper/tests. Parent review rejected its first synthetic descriptor/anchor assumptions before acquisition; actual descriptor, 2D anchor and graph fixtures corrected them.
- Separate High/Medium agents prepared the capture runner and neutral review surface. The parent reviewed and integrated them; no agent made an artistic judgment.
- A fresh GPT-6 Luna Max reviewer examined the final source, plan and measured evidence. It was not an implementer. It did not inspect imagery for artistic preference or rerun the experiment.

## Consequential review findings

1. Scope material filtering instead of global p5 `noSmooth()`. Preserve A and pheromone behavior; require prior A PNG parity and B canonical-support validation. Resolved and measured.
2. Cache content as well as revisions/dimensions/mode because world reset reuses revision numbers. Reset/resize fixtures pass.
3. Return/await the installed p5 2.3.4 redraw promise. The reviewer checked the installed implementation and found no caller break from the added return value.
4. Distinguish nominal/visible-center angle histograms from final raster orientation. Rename the misleading field, add clipped per-mark contribution weights, and disclose overlap duplication. A pixel-hash regression proves this statistical correction leaves pixels unchanged.
5. Bracket active source hashes and runner bytes at run start/end, with baseline Git hashes recorded separately. Resolved for the metadata-recovery run; original acquisition sidecar availability is explicitly limited.
6. Metadata alone does not prove RGB-lossless media. Actual final-frame RGB equality now passes for all five videos in both ffmpeg and Chrome. Native-size review interaction smoke passes with no page errors.
7. Original capture provenance must not be silently reconstructed. The attempted acquisitions, postprocessing failure and metadata-only replay are separate. No third AV capture, changed seed, longer window or aesthetic tuning was used. All 20 checkpoint PNGs match the recovery run and all 25 media hashes were unchanged.

## Final acceptance

The fresh reviewer **accepted the package as a technical bounded renderer comparison**, with human review pending. They confirmed recovery source start/end hashes, all 25 media receipts, 20 checkpoint PNG matches, C/D residual clipping mismatch, C/E contrast/coverage mismatch, decoded endpoint RGB, 354/354 tests and the successful build record.

They did not accept a pure C/E frequency effect, an artistic preference, retained-history recognition, mature-world success or production suitability. Those limits remain in the README.

Two final packaging issues were closed after review: the media verifier now explicitly asserts both players are paused after the Pause action, and the previously missing review/file-receipt documents are included before commit. No renderer/candidate pixels were changed by this closure.

A repeat of the browser pixel-copy test returned one black/empty copy despite `seeked`/readyState. The old test had not established frame presentation; a frame-availability/readout race was suspected, not separately isolated from decoder-resource effects. That failed report/log are preserved. The final check tears down the review page's preloaded players, tests one video at a time, and waits for `requestVideoFrameCallback` with the target media timestamp before copying pixels. All five copies then match exactly. This is a verification readout correction, not a candidate/video modification or an artistic black frame claim.
