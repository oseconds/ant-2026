# Stage A static heading controls — analysis receipt

Descriptive matched-seed analysis only. The three seeds are the replication units; 1 Hz frames are serially dependent.

| Variant | Seed | Late centroid (x,y) | South fraction | Centroid dispersion Rg | Population | Polarization | |angular momentum| | First RNG mismatch | First spawn time divergence | Spawns (Δ baseline) |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| baseline | 20261005 | 0.4758, 0.4737 | 0.0706 | 0.3161 | 20.4767 | 0.5578 | 0.2912 | none / baseline | none / baseline | 755 (0) |
| rotate90 | 20261005 | 0.6711, 0.6149 | 0.3887 | 0.2802 | 17.5633 | 0.5876 | 0.2859 | 1.0833 s (row 65) | spawn 4: 2.4500 vs 2.3000 s | 844 (89) |
| reverse | 20261005 | 0.5135, 0.8246 | 0.9212 | 0.2232 | 13.4700 | 0.5476 | 0.2261 | 1.9667 s (row 118) | spawn 5: 3.0500 vs 2.7500 s | 893 (138) |
| isotropic | 20261005 | 0.4892, 0.5974 | 0.3543 | 0.3218 | 18.3867 | 0.2571 | 0.3587 | 1.1833 s (row 71) | spawn 4: 2.6500 vs 2.3000 s | 795 (40) |
| baseline | 20261006 | 0.4960, 0.4657 | 0.0689 | 0.3132 | 20.2467 | 0.5919 | 0.3057 | none / baseline | none / baseline | 689 (0) |
| rotate90 | 20261006 | 0.6930, 0.6090 | 0.3842 | 0.2761 | 18.0767 | 0.6555 | 0.2699 | 1.0667 s (row 64) | spawn 5: 3.4667 vs 3.9333 s | 853 (164) |
| reverse | 20261006 | 0.5102, 0.8254 | 0.9256 | 0.2213 | 12.8933 | 0.5621 | 0.2043 | 1.0667 s (row 64) | spawn 3: 2.1667 vs 2.4000 s | 895 (206) |
| isotropic | 20261006 | 0.5073, 0.5878 | 0.3394 | 0.3208 | 17.8367 | 0.2572 | 0.3142 | 1.0667 s (row 64) | spawn 5: 3.4667 vs 3.9333 s | 801 (112) |
| baseline | 20261007 | 0.4966, 0.4491 | 0.0464 | 0.3108 | 20.4400 | 0.6451 | 0.2890 | none / baseline | none / baseline | 736 (0) |
| rotate90 | 20261007 | 0.6849, 0.6280 | 0.3718 | 0.2640 | 17.0933 | 0.6858 | 0.2436 | 0.4667 s (row 28) | spawn 2: 1.1333 vs 1.2500 s | 855 (119) |
| reverse | 20261007 | 0.5020, 0.8101 | 0.8754 | 0.2330 | 13.5633 | 0.5461 | 0.2398 | 0.4667 s (row 28) | spawn 2: 1.1333 vs 1.2500 s | 882 (146) |
| isotropic | 20261007 | 0.4832, 0.5881 | 0.4033 | 0.3359 | 17.7533 | 0.2839 | 0.3082 | 0.4667 s (row 28) | spawn 2: 1.1333 vs 1.2500 s | 816 (80) |

RNG row `i` stores state/calls immediately before zero-based simulation tick `i`, at boundary `i/60 s`; “first tick starting after boundary” is `i+1` in the receipt.

## Spawn manipulation check

| Variant | Seed | Circular center error (rad) | Heading resultant |
|---|---:|---:|---:|
| baseline | 20261005 | 0.0098 | 0.9852 |
| rotate90 | 20261005 | 0.0028 | 0.9847 |
| reverse | 20261005 | 0.0033 | 0.9851 |
| isotropic | 20261005 | n/a (isotropic) | 0.0159 |
| baseline | 20261006 | 0.0031 | 0.9854 |
| rotate90 | 20261006 | 0.0090 | 0.9846 |
| reverse | 20261006 | 0.0031 | 0.9846 |
| isotropic | 20261006 | n/a (isotropic) | 0.0133 |
| baseline | 20261007 | 0.0024 | 0.9854 |
| rotate90 | 20261007 | 0.0090 | 0.9850 |
| reverse | 20261007 | 0.0121 | 0.9852 |
| isotropic | 20261007 | n/a (isotropic) | 0.0196 |

## 1 Hz baseline outgoing-flow availability screen

| Seed | Valid frames | Fraction | Conditional R median [p95] | eligible count distribution |
|---:|---:|---:|---:|---|
| 20261005 | 94/600 | 0.1567 | 0.7286 [0.9470] | {"0":95,"1":228,"2":183,"3":81,"4":11,"5":2} |
| 20261006 | 80/600 | 0.1333 | 0.7213 [0.9730] | {"0":130,"1":230,"2":160,"3":65,"4":14,"5":1} |
| 20261007 | 81/600 | 0.1350 | 0.7302 [0.9520] | {"0":109,"1":224,"2":186,"3":67,"4":14} |

Receipt SHA-256: `a38c8adc22633f7d3123ab576bb31f9cb68d3629514d8607809401bb104a4fb6`
Analyzer SHA-256: `5e2461eca17473f67e49bd758d57f0ab09dec074c675abc84972b934b93efbcf`

Flow availability uses captured post-collision vx/vy from the last tick at 1 Hz snapshots, with midpoint approximated as position − velocity/(2×60). It does not establish all-tick availability or the direct/slow policy q.

## Limits

- Three seed-level runs per variant; 1 Hz frames are serially dependent and are not independent replications.
- RNG parity is reported only through the first mismatch; shared-stream parity is not assumed afterward.
- Flow availability is estimated from 1 Hz captured frames and approximate last-tick segment midpoints, not all 60 Hz tick segments or the declared policy q.
- The finite domain and asymmetric boundary exits constrain interpretation; population and recruitment timing are endogenous consequences.
- Raw gyrationRadius is RMS distance from nest, not dispersion about the colony centroid; this analysis derives dispersion from covariance trace without modifying raw files.
