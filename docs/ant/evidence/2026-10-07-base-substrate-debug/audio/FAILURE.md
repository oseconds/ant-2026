# Base substrate PCM capture failure

Status: failed; PCM evidence gates remain unverified.

The final recorded harness error was:

```text
page.evaluate: Error: prebirth On legacy Plate scheduler handshake timed out.
```

No WAV files or `audio-ab-report.json` were produced. The harness did not return a completed PCM capture or measurements. The failure cause is unconfirmed; the current script contains `evidence-ready` acknowledgement hooks, so this log does not attribute the failure to a missing hook.

The attempted run used a fresh `AntController` run with seed `20261005`. Intended windows were the ten seconds before and after the first natural Plate birth, derived from that run's captured descriptor. The sibling dev/prod browser evidence records that seed's first birth at approximately 103.0167 s, corresponding to intended windows `[93.0167, 103.0167)` and `[103.0167, 113.0167)` s; this failed PCM run did not produce a report binding its audio output to those windows.

Current harness SHA-256 at note creation:

```text
3A7CFA18F73DF48E1974BEFBB0C8A0615DF17BCBA4140C24C95D9940E278DD2A  scripts/ant-base-substrate-audio-evidence.js
```

Unverified: pre-birth Off exact silence; pre-birth On nonzero PCM; first-birth postbirth isolated and summed PCM; born Plate OFF/ON equivalence; finite and unclipped output; substrate-to-born level ratio; any audibility or masking claim.
