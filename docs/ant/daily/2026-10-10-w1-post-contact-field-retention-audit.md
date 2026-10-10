# W1 Post-contact Field Retention Audit

**Date:** 2026-10-10 (Asia/Seoul)

**Branch / source HEAD:** `ant-w1-episodic-material-shadow` / `eb520969fd88fb8c60deb6b46c96f7afd7dfff3f`

Reused the three frozen 599-observation snapshot archives and committed FOOT_CONTACT histories. Verified source hashes, descriptor hashes, all Float32/UInt32 array offsets, timestamps, field flags, and contact-count provenance; no ANT simulation was rerun. Replayed SurfaceField from the exact 60 Hz update order and archived contact points. It matched all 16,561,152 saved cell values exactly. Existing raw-field audit was independently rerun and all seven output hashes matched its committed evidence.

Added a read-only age/exposure audit and fixed-scale plots. `surface` after intervals without any production contact footprint followed the passive reference exactly at all 104,754 checkpoint cell intervals checked; nearby and same-cell deposits produced positive residuals. `chemicalMemory` retained small positive and negative changes inside stable q/active/ID 0 strata, including intervals without a SurfaceField contact footprint, but its complete pheromone input history is not archived. `support` is an exact checkpoint reconstruction from the SurfaceField only where the existing chemical-memory gate samples it; zero elsewhere remains conditionally unobserved.

**Decision: Informative / Mixed.** The continuous history contains distinctions absent from q, but the observed surface behavior is explained by the existing relaxation and contact kernel, support is a conditional surface sample, and chemical inputs are incomplete. This is not evidence for physical material formation. No new material rule, threshold, production behavior, or follow-up experiment was added. See [evidence package](../evidence/2026-10-10-w1-post-contact-field-retention-audit/README.md).

Validation: 7 focused fixtures passed, `npm test` passed 400/400, and `npm run build` succeeded. Independent numerical results (8 files), plots (18 images plus manifest), and fixed-scale validation matched byte-for-byte. The sandbox initially blocked child-process runners; final checks passed through the approved process allowance. Build emitted existing dependency annotation and large-chunk warnings.
