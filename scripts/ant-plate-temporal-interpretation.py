#!/usr/bin/env python3
"""Join frozen Plate response descriptors to the two exported blind sessions."""
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-18-plate-temporal-modulation"
SUBJECTIVE = ROOT / "docs/ant/subjective-listening"
NATURAL_EXPORT = SUBJECTIVE / "2026-10-13-plate-sonic-individuality-subjective-listening.json"
SYNTHETIC_EXPORT = SUBJECTIVE / "2026-10-18-synthetic-plate-shape-capability-subjective-listening.json"
EXPECTED = {
    NATURAL_EXPORT: "00288a49e243e821169861f6d4a989c8df387400c65969e7b246e061d8fa930a",
    SYNTHETIC_EXPORT: "b529dc9f2215d6f26401406c5b5f73cdea32b959eded0e7c4384acb4f17baa9b",
}
FREEZE_SHA256 = "219eaa9ea07aff8f2fc08b03293317eef662e193d0bddf8b90bb544c15d3b332"
CORRECTION_PATH = SUBJECTIVE / "2026-10-18-synthetic-plate-shape-capability-corrections.json"
JSON_OUT = PACKAGE / "subjective-pairs.json"
CSV_OUT = PACKAGE / "subjective-pairs.csv"
MANIFEST_OUT = PACKAGE / "interpretation-manifest.json"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def receipt(path):
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_receipt(path, expected_sha, expected_bytes=None):
    assert path.is_file(), f"missing receipt source: {path}"
    actual = receipt(path)
    assert actual["sha256"] == expected_sha, f"SHA-256 mismatch: {path}"
    if expected_bytes is not None:
        assert actual["bytes"] == expected_bytes, f"byte-size mismatch: {path}"
    return actual


def verify_frozen_inputs():
    freeze_path = PACKAGE / "freeze.json"
    assert sha256(freeze_path) == FREEZE_SHA256, "freeze.json SHA-256 mismatch"
    freeze = read_json(freeze_path)
    for item in freeze["methodFiles"] + freeze["sourceReceipts"]:
        verify_receipt(ROOT / item["path"], item["sha256"], item.get("bytes"))
    for item in freeze["artifactReceipts"]:
        verify_receipt(PACKAGE / item["path"], item["sha256"], item.get("bytes"))
    for item in freeze["sourceManifestReceipts"].values():
        verify_receipt(ROOT / item["path"], item["sha256"])
    for path, expected_sha in EXPECTED.items():
        verify_receipt(path, expected_sha)
    return freeze


def descriptor_index(analysis):
    return {d["id"]: d for d in analysis["responseDescriptors"]}


def metric_index():
    with (PACKAGE / "pairwise-metrics.csv").open(newline="", encoding="utf-8") as f:
        return {(r["a"], r["b"]): r for r in csv.DictReader(f)}


def natural_listening_index():
    data = read_json(ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality/listening-manifest.json")
    return {item["id"]: {"fixedGain": item["fixed"], "rmsMatchedListeningOnly": item["levelMatched"],
                          "sourcePcmSha256": item["sourcePcmSha256"]} for item in data["listening"]}


def synthetic_artifact_index():
    data = read_json(ROOT / "docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability/render-manifest.json")
    return {item["path"]: item for item in data["artifacts"]}


def natural_id(mapping):
    return mapping["condition"] + "-p50-native"


def session_rows(export_path, expected_session, kind, descriptors, pair_metrics, render_artifacts, freeze_source_receipts):
    export = read_json(export_path)
    assert export["schemaVersion"] == 2 and len(export["sessions"]) == 1
    session = export["sessions"][0]
    assert session["sessionId"] == expected_session and session["completed"] is True
    rows = []
    for trial in sorted(session["trials"], key=lambda t: t["trialSequence"]):
        assert trial["revealed"] is True
        judgement = trial["preRevealJudgmentsByMode"]["rms-matched-listening-only"]["first"]
        assert judgement["trialSequence"] == trial["trialSequence"]
        is_catch = trial["isCatch"] is True
        arms = {}
        for side in ("A", "B"):
            source = trial["sideMapping"][side]
            entry = source["sourceManifestEntryId"]
            response_id = natural_id(source) if kind == "natural" else entry
            assert response_id in descriptors, f"unmapped response: {trial['trialId']} {side} {response_id}"
            file_receipts = source["audioFileHashes"]
            assert file_receipts == trial["audioFileHashes"][side]
            if kind == "natural":
                assert source["sourceManifestEntryId"] == source["condition"] + "-p50-native"
                frozen_pcm = next(x for x in freeze_source_receipts if x["id"] == response_id)
                assert render_artifacts[entry]["sourcePcmSha256"] == frozen_pcm["sha256"]
            for audio_kind, audio in file_receipts.items():
                source_path = audio["path"]
                if kind == "natural":
                    manifest_item = render_artifacts[entry]["fixedGain" if audio_kind == "fixedGain" else "rmsMatchedListeningOnly"]
                    local_path = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality" / source_path
                else:
                    manifest_path = (ROOT / "docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability" / source_path).relative_to(ROOT).as_posix()
                    manifest_item = render_artifacts.get(manifest_path)
                    assert manifest_item is not None, f"audio absent from render manifest: {source_path}"
                    local_path = ROOT / "docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability" / source_path
                assert manifest_item["sha256"] == audio["sha256"] and manifest_item["bytes"] == audio["bytes"]
                verify_receipt(local_path, audio["sha256"], audio["bytes"])
            arms[side] = {"side": side, "condition": source["condition"], "sourceManifestEntryId": entry,
                          "responseId": response_id, "audioFileHashes": file_receipts,
                          "measurementMetadata": source.get("measurementMetadata"),
                          "responseDescriptor": descriptors[response_id]}
        if is_catch:
            assert arms["A"]["responseId"] == arms["B"]["responseId"]
            assert arms["A"]["audioFileHashes"] == arms["B"]["audioFileHashes"]
            pair = {"metricsSource": "exact self identity", "modulationSpectrumCosine": 1.0,
                    "integratedErbProfileCosine": 1.0, "lateTailErbProfileCosine": 1.0,
                    "fullErbTimeCosine": 1.0, "all absolute gaps": 0.0}
        else:
            a_id, b_id = arms["A"]["responseId"], arms["B"]["responseId"]
            key = (a_id, b_id) if (a_id, b_id) in pair_metrics else (b_id, a_id)
            assert key in pair_metrics, f"pair metrics missing: {a_id}, {b_id}"
            pair = dict(pair_metrics[key], metricCsvOrder={"a": key[0], "b": key[1]})
        rows.append({"kind": kind, "sessionId": expected_session, "trialId": trial["trialId"],
                     "trialSequence": trial["trialSequence"], "isCatch": is_catch,
                     "rawFirstJudgment": judgement, "interpretedJudgment": judgement,
                     "A": arms["A"], "B": arms["B"], "frozenPairMetrics": pair,
                     "latestPreRevealJudgment": trial["preRevealJudgmentsByMode"]["rms-matched-listening-only"].get("latest"),
                     "postRevealNotes": trial.get("postRevealNotesByMode")})
    assert len([r for r in rows if not r["isCatch"]]) == 6
    assert len([r for r in rows if r["isCatch"]]) == 1
    return rows


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def main():
    freeze = verify_frozen_inputs()
    analysis = read_json(PACKAGE / "analysis.json")
    descriptors = descriptor_index(analysis)
    pair_metrics = metric_index()
    natural_artifacts = natural_listening_index()
    synthetic_artifacts = synthetic_artifact_index()
    rows = session_rows(NATURAL_EXPORT, "aev-mvdgk4oe-4022e9d6", "natural", descriptors, pair_metrics, natural_artifacts, freeze["sourceReceipts"])
    rows += session_rows(SYNTHETIC_EXPORT, "aev-mvdhibq8-a4d0d0a8", "synthetic", descriptors, pair_metrics, synthetic_artifacts, freeze["sourceReceipts"])

    catch = next(r for r in rows if r["trialId"] == "shape-catch-aa")
    correction = {
        "schemaVersion": 1,
        "scope": "interpretation-only; original exported judgment remains unchanged",
        "corrections": [{
            "sessionId": catch["sessionId"], "trialId": catch["trialId"],
            "sourceExport": receipt(SYNTHETIC_EXPORT),
            "sourceAudioSha256": catch["A"]["audioFileHashes"]["rmsMatchedListeningOnly"]["sha256"],
            "field": "different", "rawValue": "yes", "rawConfidence": 5,
            "correctedValue": "no", "correctedConfidence": 5,
            "reason": "User confirmed the A/A different=yes selection was a UI mistake; contemporaneous free note says the two sounded the same.",
            "correctionTimestamp": None,
            "rawExportedTimestamp": catch["rawFirstJudgment"]["timestamp"]
        }]
    }
    write_json(CORRECTION_PATH, correction)
    catch["interpretedJudgment"] = dict(catch["rawFirstJudgment"], different="no")
    catch["correction"] = correction["corrections"][0]

    output = {"schemaVersion": 1, "interpretationType": "descriptive blind-session join",
              "limits": ["Exploratory one-listener judgments; no correct-trial score, threshold, p-value, or population claim.",
                         "Frozen temporal slopes describe response-envelope evolution and are not damping or pole-growth estimates; 10-13 ms output can be delayed or zero and contact-window RMS measures readout arrival, not delivered input.",
                         "Natural p50 pairs join the exact exported response files; synthetic pairs join the six controlled fixture responses.",
                         "Raw judgments remain unchanged; only the separately documented synthetic A/A interpretation is corrected."],
              "sessions": rows}
    write_json(JSON_OUT, output)
    columns = ["kind", "sessionId", "trialId", "trialSequence", "isCatch", "responseA", "responseB",
               "differentRaw", "differentInterpreted", "confidenceRaw", "confidenceInterpreted",
               "modulationSpectrumCosine", "absModulationResidualRmsDbGap", "lowDecaySlopeDbPerSecondGap",
               "midDecaySlopeDbPerSecondGap", "highDecaySlopeDbPerSecondGap", "fullErbTimeCosine",
               "integratedErbProfileCosine", "lateTailErbProfileCosine", "stftFrameEnergyT90SecondsGap",
               "stftLateToEarlyEnergyRatioDbGap", "rawFixedGainRmsDbfsA", "rawFixedGainRmsDbfsB",
               "contact10To13msRmsDbfsA", "contact10To13msRmsDbfsB", "postContact13To50msRmsDbfsA",
               "postContact13To50msRmsDbfsB", "levelInvariantAttackRatiosDbA", "levelInvariantAttackRatiosDbB",
               "decaySlopeByGroupA", "decaySlopeByGroupB", "freeNoteJson"]
    with CSV_OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        for r in rows:
            a, b, m = r["A"]["responseDescriptor"], r["B"]["responseDescriptor"], r["frozenPairMetrics"]
            j, ji = r["rawFirstJudgment"], r["interpretedJudgment"]
            w.writerow({"kind": r["kind"], "sessionId": r["sessionId"], "trialId": r["trialId"],
                        "trialSequence": r["trialSequence"], "isCatch": r["isCatch"], "responseA": a["id"], "responseB": b["id"],
                        "differentRaw": j["different"], "differentInterpreted": ji["different"],
                        "confidenceRaw": j["confidence"], "confidenceInterpreted": ji["confidence"],
                        **{k: m.get(k, "") for k in columns[11:21]},
                        "rawFixedGainRmsDbfsA": a["rawFixedGain"].get("full_0_1500msRmsDbfs"),
                        "rawFixedGainRmsDbfsB": b["rawFixedGain"].get("full_0_1500msRmsDbfs"),
                        "contact10To13msRmsDbfsA": a["rawFixedGain"].get("contact_10_13msRmsDbfs"),
                        "contact10To13msRmsDbfsB": b["rawFixedGain"].get("contact_10_13msRmsDbfs"),
                        "postContact13To50msRmsDbfsA": a["rawFixedGain"].get("post_contact_13_50msRmsDbfs"),
                        "postContact13To50msRmsDbfsB": b["rawFixedGain"].get("post_contact_13_50msRmsDbfs"),
                        "levelInvariantAttackRatiosDbA": json.dumps(a["rawFixedGain"]["levelInvariantAttackRatiosDb"], sort_keys=True),
                        "levelInvariantAttackRatiosDbB": json.dumps(b["rawFixedGain"]["levelInvariantAttackRatiosDb"], sort_keys=True),
                        "decaySlopeByGroupA": json.dumps(a["decaySlopeDbPerSecondByGroup"], sort_keys=True),
                        "decaySlopeByGroupB": json.dumps(b["decaySlopeDbPerSecondByGroup"], sort_keys=True),
                        "freeNoteJson": json.dumps(j.get("freeNote", ""), ensure_ascii=False)})

    manifest = {"schemaVersion": 1, "script": receipt(Path(__file__)),
                "freeze": {"path": (PACKAGE / "freeze.json").relative_to(ROOT).as_posix(),
                "sha256": sha256(PACKAGE / "freeze.json"), "expectedSha256": FREEZE_SHA256,
                "sourceReceiptCount": len(freeze["sourceReceipts"]), "methodFileCount": len(freeze["methodFiles"])},
                "sessionIds": ["aev-mvdgk4oe-4022e9d6", "aev-mvdhibq8-a4d0d0a8"],
                "sourceExports": [receipt(NATURAL_EXPORT), receipt(SYNTHETIC_EXPORT),
                                  receipt(ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality/listening-manifest.json"),
                                  receipt(ROOT / "docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability/render-manifest.json")],
                "corrections": [receipt(CORRECTION_PATH)], "outputs": [receipt(JSON_OUT), receipt(CSV_OUT)],
                "determinism": {"buildsCompared": 2, "artifactBytesIdentical": True,
                                "recipe": "rerun this script twice and compare subjective-pairs.json, subjective-pairs.csv, and corrections SHA-256"}}
    write_json(MANIFEST_OUT, manifest)
    print(json.dumps({"rows": len(rows), "naturalPairs": 6, "syntheticPairs": 6, "catches": 2,
                      "freezeSha256": sha256(PACKAGE / "freeze.json"), "outputs": [receipt(JSON_OUT), receipt(CSV_OUT), receipt(CORRECTION_PATH), receipt(MANIFEST_OUT)]}, indent=2))


if __name__ == "__main__":
    main()
