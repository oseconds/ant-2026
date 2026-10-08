# Frozen input expansion and provenance

The user explicitly authorized hash-verified saved full snapshots to reconstruct missing frozen analysis inputs. ANT was not rerun. This expands the analysis input package; it does not change the original natural run or previously committed evidence. Original summaries, snapshots, contacts and birth records remain unchanged.

## Saved files and arrays

For each seed, `test-results/ant-interior-endpoint-shadow/seed<seed>-snapshots.bin.gz` is the saved stream; its compressed byte size and SHA-256 match the records already committed in `docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data/replay-verification.json`. The matching `test-results/ant-interior-endpoint-shadow/seed<seed>-summary.json` supplies the exact XOR descriptor/array offsets and original provenance. Both are checked before decoding. The saved stream contains Float32 `chemical`, `chemicalMemory`, `surface`, and `support`, plus UInt32 `contactCounts`, at all 599 timestamps.

Only `chemicalMemory` and conditional `support` produce per-cell threshold flags. `contactCounts` verifies every-frame parity against actual individual FOOT_CONTACT positions, and cumulative distinct contact times come from the existing committed contact archive, never from chemical interpolation. `chemical` is decoded but unused. Exact `chemicalMemory`, `support`, and `surface` Float32 bytes are retained for the three matched field plots. No path, candidate, controller state, or artificial birth is reconstructed.

| Seed | Full saved snapshot compressed SHA-256 | Original morphology summary compressed SHA-256 | Gap rows |
|---|---|---|---:|
| 20261005 | `a9eb9cd63ee9fd39271efdf9ea9729507fb3b08990d15d2a5f9aebd7fb992e9f` | `1299a593bbef84f97a2db181cbb69f1065caab668b734e27ad19107bd56cbe69` | 5 |
| 20261006 | `a46fec776dff03833ac0551e601b42b4191360e06135e244ebe149edeef22c3e` | `373035ddf26e91ee066dc50008b95fc114d7a896993b640437edc03fcaf5a639` | 9 |
| 20261007 | `80e410278f3a732d7d0784fd8c1d775785d923df1e2cb60da8d79bf12dca4350` | `dc4d210bc25696fff2fb02b7ffa53bcaf9b6360d98177c88c7b3945b9e0f460f` | 11 |

Raw decoded snapshot and original raw summary hashes are in `input-gap.json`; exact saved summary/contact hashes, prior replay source hashes, byte sizes, array offsets, and original file paths are in each `seed<seed>-metadata.json`. The snapshot streams are 110,407,680 decoded bytes each. The compressed saved streams are 42,694,915 / 43,440,798 / 42,321,540 bytes.

## All 25 four-cell omissions

All other timestamps have exact union equality; no timestamp has extra cells. These are omissions from the old committed morphology component summary, not missing natural contacts. The immutable original summary is compared with `chemicalMemory >= .30 && support >= .015` at the same recorded tick. Indices use `y * 96 + x`, zero based. Full binary64 time values are shown. Every listed row has exactly four omitted cells.

| Seed | Tick | Recorded seconds | Original union / complete support cells | Omitted indices |
|---|---:|---:|---:|---|
| 20261005 | 7981 | 133.0166666666808 | 2006 / 2010 | 1645, 1646, 1741, 1742 |
| 20261005 | 11461 | 191.01666666664704 | 2472 / 2476 | 1387, 1388, 1483, 1484 |
| 20261005 | 11521 | 192.01666666664647 | 2476 / 2480 | 1387, 1388, 1483, 1484 |
| 20261005 | 18121 | 302.0166666666521 | 2877 / 2881 | 2690, 2691, 2786, 2787 |
| 20261005 | 18181 | 303.01666666665324 | 2890 / 2894 | 2690, 2691, 2786, 2787 |
| 20261006 | 16741 | 279.0166666666253 | 2797 / 2801 | 6562, 6563, 6658, 6659 |
| 20261006 | 16801 | 280.01666666662646 | 2805 / 2809 | 6562, 6563, 6658, 6659 |
| 20261006 | 16861 | 281.01666666662766 | 2819 / 2823 | 6562, 6563, 6658, 6659 |
| 20261006 | 16921 | 282.0166666666288 | 2816 / 2820 | 6562, 6563, 6658, 6659 |
| 20261006 | 16981 | 283.01666666662993 | 2813 / 2817 | 6562, 6563, 6658, 6659 |
| 20261006 | 17041 | 284.0166666666311 | 2805 / 2809 | 6562, 6563, 6658, 6659 |
| 20261006 | 34796 | 579.9333333334479 | 2907 / 2911 | 6831, 6832, 6927, 6928 |
| 20261006 | 34857 | 580.9500000001123 | 2913 / 2917 | 6831, 6832, 6927, 6928 |
| 20261006 | 34918 | 581.9666666667765 | 2920 / 2924 | 6831, 6832, 6927, 6928 |
| 20261007 | 16201 | 270.0166666666148 | 2712 / 2716 | 2612, 2613, 2708, 2709 |
| 20261007 | 16261 | 271.016666666616 | 2709 / 2713 | 2612, 2613, 2708, 2709 |
| 20261007 | 27961 | 466.016666666843 | 2864 / 2868 | 7323, 7324, 7419, 7420 |
| 20261007 | 28021 | 467.0166666668442 | 2868 / 2872 | 7323, 7324, 7419, 7420 |
| 20261007 | 29761 | 496.01666666687794 | 2876 / 2880 | 254, 255, 350, 351 |
| 20261007 | 29821 | 497.0166666668791 | 2882 / 2886 | 254, 255, 350, 351 |
| 20261007 | 29881 | 498.01666666688027 | 2892 / 2896 | 254, 255, 350, 351 |
| 20261007 | 29941 | 499.0166666668814 | 2894 / 2898 | 254, 255, 350, 351 |
| 20261007 | 30001 | 500.0166666668826 | 2901 / 2905 | 254, 255, 350, 351 |
| 20261007 | 30061 | 501.01666666688374 | 2900 / 2904 | 254, 255, 350, 351 |
| 20261007 | 30121 | 502.01666666688493 | 2896 / 2900 | 254, 255, 350, 351 |

## Newly packaged frozen inputs

`flags.bin.gz` is one byte per cell per frame: bit 0 chemicalMemory >= .30, bit 1 support >= .015, bit 2 at least two distinct actual contact timestamps through that frame. It preserves these predicates exactly, not full grayscale time series. The full saved arrays are needed because the old selected-component summaries discard eligible cells; no old artifact was replaced. `milestones.bin.gz` preserves exact Float32 bytes for field visualization, with descriptors in metadata. All 11 files below reproduced byte-for-byte on a separate preparation run.

| File | Bytes | SHA-256 |
|---|---:|---|
| input-gap.json | 10518 | `66fa4d170e2b38621674a4add351fa3e429d67e06332617e729128012c197423` |
| manifest.json | 659 | `59abc2bf38f7d4c401529348c327317028cfc32423e5eb64c20005c1dce95f3e` |
| seed20261005-flags.bin.gz | 306669 | `508f93c15eb808c71b0d7c0bccba50b9589041676cd769c40941f9d5427df518` |
| seed20261005-metadata.json | 50720 | `471b80d280cc25532f8fe9f829257262ad72ebda24f321fb192fd4bb91862089` |
| seed20261005-milestones.bin.gz | 201470 | `373ba6448e7d30b16e6748afed2160197c8e4a4f62b23e70564841caee632b6e` |
| seed20261006-flags.bin.gz | 381760 | `7a051193a902ad0f7fc95d9c4aaaefeded832d20d5e19b569f69a05b1d820e67` |
| seed20261006-metadata.json | 50720 | `ecca1623c5a4814032c094447af60b47ce3407fa2f912efc3f14d2aefd1f3ab1` |
| seed20261006-milestones.bin.gz | 202134 | `9a6ef1d9cbf34fb63bb3ec706d3e40bdaee85ec7be7075aaf01859d36ec8c070` |
| seed20261007-flags.bin.gz | 331294 | `30403c6f1a9795fd0fa1910b332e0be6be9fe24e04356087ba03da5464bedb6c` |
| seed20261007-metadata.json | 50722 | `90b3be0ba68726730c127c3280db5bb4daa1f92d3b279356b8efa149871ca3bd` |
| seed20261007-milestones.bin.gz | 200625 | `ab2b75bb4e1afb7522072ba27b3c753cd2bfbc07a71ab29015b812e7f15a6f16` |
