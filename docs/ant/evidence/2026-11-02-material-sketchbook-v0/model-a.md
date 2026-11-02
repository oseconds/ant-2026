# Material Sketchbook A — activity-fed wandering film

**Status:** invented discovery model; parameters frozen before its first accepted observation. This is not a calibrated liquid, ant response, or ANT production law.

## Fixed model

- Grid: 24 × 24 equal cells on the unit square; update `dt = 1/60 s`.
- The grid exterior has no mass flux; transport uses only existing orthogonal neighbor edges.
- Seed: `20261005`; four independent virtual sources start at seeded random cells.
- Initial cell fields: mass `m=0`, agitation `a=0`, bond `b=0`.
- Sources: each moves to a uniformly selected orthogonal neighbor every `0.75 s`; boundary cells choose among their available neighbors. While elapsed time is below 30 s, each source adds `0.08*dt` mass and `0.006` agitation to its current cell per update. Both inputs stop at 30 s.
- Agitation decays each update by `exp(-dt/2.5)`.
- For every undirected neighbor edge `(i,j)`, mass flux is `f = dt*0.10*(1 + 0.5*mean(a_i,a_j))*(1 - 0.9*mean(b_i,b_j))*(m_i-m_j)`. Subtract `f` from `i`, add it to `j`. Agitation raises mobility and bonded structure lowers it; with `a ∈ [0,2]`, `b ∈ [0,1]`, edge mobility remains positive in `[0.01,0.20]`. This law continues after source input ends.
- Bond changes by `dt*(0.06*m*(1-b) - 0.18*a*b)` per cell, then is bounded to `[0,1]`. Mass promotes bonding; agitation breaks it. Bond rebuilding is slow at the observed low local masses; agitation has a fixed 2.5 s decay time.
- Agitation is bounded to `[0,2]`; no mass is removed. The source budget is at most `4*0.08*30 = 9.6` mass units.

These simultaneous input and field rules define the model; they are not tuned to a target image, sound, or morphology. The coarse mechanics view uses 8 × 8 blocks. For each block, `f = blockMass/(0.25 + blockMass)` is its material contact weight. Effective mass is `0.25 + blockMass`; `0.25` is a numerical observation carrier, not a substrate. Ground is `(0.04 + 0.8*meanBond)*f`; damping is `0.08 + 0.12*meanBond`. An edge spring between blocks `i,j` is `(0.015 + 0.15*min(meanBond_i,meanBond_j))*f_i*f_j`. The shared probe must multiply applied force and readout by each node's `f` without renormalizing these weights. Thus an empty initial graph has no material contact, ground or spring response even though its numerical masses/damping remain defined. This is an observation mapping, not a claim about a real sheet.

## Observation boundary

The first accepted browser captures use seed `20261005` at 0, 30, 120 and 300 s under the shared protocol. No seed search or parameter adjustment follows those captures. Longer runs are finite-state validation only. The model creates no browser or audio resources and imports no ANT production system.
