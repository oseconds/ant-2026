# Repository guidance

- For ANT work, start with `docs/ant/README.md`. Use `docs/ant/evidence/` for experiment evidence and `docs/ant/daily/` for chronology.
- For generic String/Plate/Sphere or shared library work, start with `docs/physical-audio-lab.md`.
- For work spanning ANT and shared audio, read the relevant sections of both guides.
- The root `README.md` is the public project overview. Consult it when project-level context is useful, but do not treat it as the canonical ANT implementation guide.
- Before resuming work, inspect `git status`, `git diff` and recent commits. Preserve valid partial/untracked work; never absorb unrelated files into a pass.
- Work one ANT experiment at a time and prefer small, falsifiable passes. Do not tune behavior merely to manufacture a desired visual/social pattern.
- Keep ANT behavior framework-independent. `AntController` coordinates systems; behavior/fields/material logic stay out of the renderer. `AntRenderer` only draws snapshots. Browser/audio resources are not created at module top-level.
- The founder-refined behavior baseline is frozen at `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9`. Preserve movement, steering, gait, collision, pheromone, SurfaceField, recruitment and Plate-birth qualification unless fixing a demonstrated bug.
- S0/S1 read-only social observation is complete; the latest implementation/evidence baseline is `af9c417ac9993a24cbebd42a9248fb99f14a8f2c`. `DynamicSocialGraph` / `TemporalSocialTopology` must remain observers: no RNG consumption, steering callback, AntAgent social state or automatic controller/renderer feedback.
- Current social evidence does **not** demonstrate persistent pioneer behavior or social roles. The next research gate is movement-constrained null validation. Do not proceed automatically to λ₂/eigenmodes, adaptive social memory, social feedback or graph→Plate coupling.
- Keep `TrailPlateBirth` focused on immutable births and `MaterialStratigraphy` on mutable exposure/depth. Depth comes from later overlapping material, never age alone. Ordinary feet directly excite only exposed top material; buried material receives energy through coupling.
- Preserve the current sonic baseline: 3 ms finite contact pulse, 75 ms local recovery and ×50 Plate damping. Mature 20–30 Plate AudioWorklet realtime collapse remains a known deferred issue; do not mix runtime optimization into unrelated ANT passes.
- Preserve historical evidence. Do not normalize, recolor, overwrite or fabricate natural milestones in committed evidence. Fixed-scale waveform/spectrogram comparisons must stay fixed-scale.
- New claims must distinguish implemented facts, descriptive observations, research-supported interpretation and artistic/modeling extensions. In particular, graph spectral modes are not established ant biological entities.
- After a pass, keep detailed measurements/reproduction in the relevant evidence package and record the process/decision chronology in `docs/ant/daily/`. Keep root README and this file concise rather than copying full experiment reports.
