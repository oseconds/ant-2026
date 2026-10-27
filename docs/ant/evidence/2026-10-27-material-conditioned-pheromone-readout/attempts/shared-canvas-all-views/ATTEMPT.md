# Invalid acquisition — shared canvas for all views

This completed bounded H1 capture is retained only as a failed technical acquisition. Do not use its stills or videos for artist review. The media were removed after recording their byte counts and SHA-256 hashes in [`MEDIA-SHA256.json`](MEDIA-SHA256.json), because they failed the preregistered View 1 checkpoint parity requirement.

The capture passed same-state/RNG and sampled full-frame locality checks. View 1 pre-Plate and immediate post-Plate stills matched the prior reference. Its +15 s and +30 s stills did not. The capture runner raised at the +15 s parity assertion after rendering the remaining outputs. All 16 stills and four 351-frame videos were hash-receipted, then removed from the package. No candidate parameter changed.

The planned next layout (separate View 1 renderer, shared View 2–4 renderer) was superseded after further raster-path testing. The valid matrix uses one shared renderer/canvas for all four views. Its same-state frame/RNG parity is exact, but its View 1 raster differs from the prior four-renderer capture at all four checkpoints; that discrepancy is recorded in the parent package README and `capture.json`. The invalid media remain removed.
