# Validation and provenance

## Authority

- New branch starts from the live verified origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44.
- Previous result: codex/ant-materialization-update-fixed-nucleus-20261031@3ddf7a2fb08e6a91ce71f9edf3ec4c7c8237e386.
- Current TrailPlateBirth.js: Git blob 238cc365f2602dc6a22091d69237b88962825a13; raw SHA-256 283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860; LF SHA-256 cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67.
- Live git ls-remote origin refs/heads/main confirmed the pinned main SHA. No src/ or static/ file changed.

## Frozen packet chain

- Exact previous data/frozen-inputs.json.gz: 2,933,202 bytes; SHA-256 ec56df45a4e346f7ea79d3e368654b788dc08e8a9c4d40009df8fd57a80cd864.
- Original source packet: commit 0d5096a920e1ebb2086fa1dae782c5d4e871b590, path docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz; gzip SHA-256 909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc; decoded SHA-256 fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339.
- Prior registered-X reference: SHA-256 3315321b5bbe0599949d742e794236de1b855b98fe96669a6f1b5244764c0345.
- Prior B reference is extracted from previous analysis SHA-256 0535b9aa419a6066a946e2a37e8e2bf56c903dd64532162c96544cc96a597f2c; its own SHA-256 is 395ec41625c9806f40321a3511b4230e04b30d03e73e62d2d463df3f5211ff07.
- Prior UPDATE E/I parity receipt: SHA-256 9345bdfc776823873b54a3b6f29e6453537fa261107c8f88c1742b3591359719; exact times/E/I all 42/42.
- Prior capture E/F/D parity receipt: SHA-256 48f30bed540f2db400700504c2b09b35737acc4965c9e7b278f5cc2cc165bd68; shared anchors all 10/10.

## Checks before stop

- Current production thinning reproduced saved F at all 42 anchors.
- B reproduced the prior fixed-nucleus memberships exactly at all 42 anchors.
- START nuclei matched at both events.
- Registered stateless-X reference matched at all ten shared anchors.
- n0 remained edge-bearing in current F wherever B was reproduced.
- Observer RNG calls: 0.
- The analyzer stopped at the first direct Q-only signature violation. It emitted only data/stop-witness.json; no treatment summary or outcome classification was written.
- node --check scripts/ant-materialization-e-incumbent-eligibility.js passed.
- node scripts/ant-materialization-e-incumbent-eligibility.js --write reproduced the stop receipt.
- node scripts/ant-materialization-e-incumbent-eligibility.js --check byte-compared the receipt and reported deterministic output.
- Independent read-only review independently reproduced B 42/42 and the P2 witness/path.

## Exclusions

No new simulation, seed, trajectory, thresholds, production behavior, Residence, maturation/COMMIT, descriptor, audio, PR, or merge.
