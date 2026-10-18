#!/usr/bin/env python3
"""Generate a self-contained ANT A/B audio evidence viewer from a small config."""
import argparse
import base64
import hashlib
import json
import math
import os
import platform
import re
import struct
import types
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
ERB_HELPER = ROOT / "scripts/ant-base-born-loss-analysis.py"
ERB_SPEC = {"sampleRate": 48_000, "fftSize": 1024, "hopSize": 256, "maxHz": 8_000, "bands": 30}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_receipt(path, package):
    data = path.read_bytes()
    try:
        receipt_path = path.relative_to(package)
    except ValueError:
        receipt_path = path.relative_to(ROOT)
    return {"path": receipt_path.as_posix(), "bytes": len(data), "sha256": sha256(data)}


def package_file(package, value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a relative path")
    path = (package / value).resolve()
    if not path.is_relative_to(package.resolve()):
        raise ValueError(f"{label} escapes the evidence package")
    return path


def manifest_file(package, value, label, allow_repository_path=False):
    relative = Path(value) if isinstance(value, str) else Path()
    if (not isinstance(value, str) or not value or relative.is_absolute() or relative.drive or
            ".." in relative.parts):
        raise ValueError(f"{label} must be a repository-relative path")
    path = (ROOT / relative).resolve()
    boundary = ROOT.resolve() if allow_repository_path else package.resolve()
    if not path.is_relative_to(boundary):
        raise ValueError(f"{label} escapes {'the repository' if allow_repository_path else 'the evidence package'}")
    return path


def configured_audio_file(package, value, label, allow_repository_path):
    if allow_repository_path:
        return manifest_file(package, value, label, allow_repository_path=True)
    path = package_file(package, value, label)
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError(f"{label} escapes the evidence package")
    return path


def load_helper():
    module = types.ModuleType("ant_base_born_loss_analysis")
    module.__file__ = str(ERB_HELPER)
    exec(compile(ERB_HELPER.read_text(encoding="utf-8"), str(ERB_HELPER), "exec"), module.__dict__)
    return module


def read_float_stereo_wav(path):
    path = Path(path)
    raw = path.read_bytes()
    if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"{path}: not a RIFF/WAVE file")
    fmt, data, offset = None, None, 12
    while offset + 8 <= len(raw):
        name, size = struct.unpack_from("<4sI", raw, offset)
        start = offset + 8
        chunk = raw[start:start + size]
        if len(chunk) != size:
            raise ValueError(f"{path}: truncated RIFF chunk")
        if name == b"fmt ":
            fmt = chunk
        elif name == b"data":
            data = chunk
        offset = start + size + (size & 1)
    if fmt is None or data is None or len(fmt) < 16:
        raise ValueError(f"{path}: missing fmt or data chunk")
    audio_format, channels, rate, byte_rate, block_align, bits = struct.unpack_from("<HHIIHH", fmt)
    expected = (3, 2, ERB_SPEC["sampleRate"], ERB_SPEC["sampleRate"] * 8, 8, 32)
    if (audio_format, channels, rate, byte_rate, block_align, bits) != expected:
        raise ValueError(f"{path}: expected IEEE-float stereo 48 kHz, found {(audio_format, channels, rate, byte_rate, block_align, bits)}")
    if len(data) % block_align or offset != len(raw):
        raise ValueError(f"{path}: invalid WAVE payload length")
    audio = np.frombuffer(data, dtype="<f4").reshape(-1, channels).astype(np.float64)
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError(f"{path}: empty or non-finite audio")
    return audio


def analyze_pair(pair, helper, absolute_scale, difference_scale):
    a = pair["a"]["audio"]["fixedGain"]["absolutePath"]
    b = pair["b"]["audio"]["fixedGain"]["absolutePath"]
    base, born = read_float_stereo_wav(a), read_float_stereo_wav(b)
    if base.shape != born.shape:
        raise ValueError(f"{pair['id']}: fixed-gain A/B samples are not aligned")
    base_bands, _, band_index, centers = helper.erb_aggregate(
        helper.stft_power(base, sample_rate=ERB_SPEC["sampleRate"]))
    born_bands, _, _, _ = helper.erb_aggregate(
        helper.stft_power(born, sample_rate=ERB_SPEC["sampleRate"]))
    base_power, born_power = base_bands.mean(axis=2), born_bands.mean(axis=2)
    base_db, born_db = helper.power_db(base_power), helper.power_db(born_power)
    difference_db = helper.difference_db(base_power, born_power)
    if base_db.shape[1] != ERB_SPEC["bands"] or not all(
            np.isfinite(value).all() for value in (base_db, born_db, difference_db)):
        raise ValueError(f"{pair['id']}: invalid ERB output")
    parity = None
    expected = ((pair.get("analysisSummary") or {}).get("nativeErbDifference") or {}).get(
        "integratedBandBornMinusBaseDb")
    if expected is not None:
        integrated = helper.power_db(born_power.sum(axis=0)) - helper.power_db(base_power.sum(axis=0))
        if len(expected) != ERB_SPEC["bands"]:
            raise ValueError(f"{pair['id']}: existing analysis has the wrong ERB band count")
        parity_error = float(np.max(np.abs(integrated - np.asarray(expected, dtype=float))))
        if parity_error > 1e-10:
            raise ValueError(f"{pair['id']}: fixed-gain ERB differs from saved analysis by {parity_error} dB")
        parity = {"pairId": pair["id"], "contactIndex": pair["analysisSummary"]["contactIndex"],
                  "metric": "integratedBandBornMinusBaseDb", "maxAbsoluteErrorDb": parity_error,
                  "passed": True}
    return {
        "aDb": base_db.tolist(), "bDb": born_db.tolist(), "differenceDb": difference_db.tolist(),
        "bandCentersHz": centers.tolist(), "emptyBandIndices": [int(i) for i in range(ERB_SPEC["bands"])
            if not np.any(band_index == i)], "frameCount": int(base_db.shape[0]),
        "durationMs": len(base) * 1000 / ERB_SPEC["sampleRate"],
        "absoluteScaleDb": absolute_scale, "differenceScaleDb": difference_scale,
    }, parity


def analysis_summary(analysis, contact_index, window_ms):
    event = next((row for row in analysis.get("eventDetails", [])
                  if row.get("contactIndex") == contact_index), None)
    if event is None:
        raise ValueError(f"analysis.json has no contactIndex {contact_index}")
    window = event.get("windows", {}).get(str(window_ms))
    if not window or not window.get("complete"):
        raise ValueError(f"contactIndex {contact_index} lacks a complete {window_ms} ms analysis window")
    return {
        "contactIndex": contact_index, "simulationTimeMs": event["simulationTimeMs"],
        "acceptedBornStrikeCount": event["acceptedBornStrikeCount"], "windowMs": window_ms,
        "otherParentGroupsStartingInWindow": window["otherParentGroupsStartingInWindow"],
        "otherBornStrikesStartingInWindow": window["otherBornStrikesStartingInWindow"],
        "fixedGain": window["fixedGain"], "shapeOnly": window["shapeOnly"],
        "nativeErbDifference": window["nativeErbDifference"],
    }


def validate_scale(value, label, symmetric=False):
    if (not isinstance(value, list) or len(value) != 2 or
            not all(isinstance(x, (int, float)) and math.isfinite(x) for x in value) or value[0] >= value[1]):
        raise ValueError(f"{label} must be a finite [min, max] scale")
    if symmetric and not math.isclose(abs(value[0]), abs(value[1]), rel_tol=0, abs_tol=1e-12):
        raise ValueError(f"{label} must be symmetric around zero")
    return [float(value[0]), float(value[1])]


def build_data(config, config_path, package, helper):
    if not isinstance(config, dict) or type(config.get("schemaVersion")) is not int or config["schemaVersion"] != 1:
        raise ValueError("viewer config schemaVersion must be 1")
    for key in ("viewerId", "evidenceId", "title", "sourceListeningManifest", "output", "pairs"):
        if key not in config:
            raise ValueError(f"viewer config missing {key}")
    if (not isinstance(config["viewerId"], str) or not ID_PATTERN.fullmatch(config["viewerId"]) or
            not isinstance(config["evidenceId"], str) or not ID_PATTERN.fullmatch(config["evidenceId"])):
        raise ValueError("viewerId and evidenceId must use letters, digits, dot, underscore, or hyphen")
    if not isinstance(config["title"], str) or not config["title"].strip():
        raise ValueError("title must be non-empty text")
    if not isinstance(config.get("metadata", ""), str):
        raise ValueError("metadata must be text")
    allow_repository_audio_paths = config.get("allowRepositoryRelativeAudioPaths", False)
    if type(allow_repository_audio_paths) is not bool:
        raise ValueError("allowRepositoryRelativeAudioPaths must be boolean")
    output_path = package_file(package, config["output"], "output")
    manifest_path = package_file(package, config["sourceListeningManifest"], "sourceListeningManifest")
    manifest_bytes = manifest_path.read_bytes()
    listening_manifest = json.loads(manifest_bytes)
    if isinstance(listening_manifest.get("pairs"), list):
        source_manifest_kind = "pairs"
        manifest_rows = listening_manifest["pairs"]
        source_pairs = {row["label"]: row for row in manifest_rows}
    elif isinstance(listening_manifest.get("listening"), list):
        source_manifest_kind = "listening"
        manifest_rows = listening_manifest["listening"]
        source_pairs = {row["id"]: row for row in manifest_rows}
    else:
        raise ValueError("listening manifest must contain pairs or listening entries")
    if len(source_pairs) != len(manifest_rows):
        raise ValueError("listening manifest contains duplicate source identifiers")
    if not isinstance(config["pairs"], list) or len(config["pairs"]) < 1:
        raise ValueError("pairs must contain at least one A/B pair")
    erb_config = config.get("erb")
    erb = None
    absolute_scale = difference_scale = None
    if erb_config is not None:
        if not isinstance(erb_config, dict):
            raise ValueError("erb must be an object")
        absolute_scale = validate_scale(erb_config.get("absolutePowerDbScale"), "absolutePowerDbScale")
        difference_scale = validate_scale(erb_config.get("differenceDbScale"), "differenceDbScale", symmetric=True)
        if absolute_scale[0] >= 0 or absolute_scale[1] < 0:
            raise ValueError("absolutePowerDbScale must include zero and negative dB power")
        erb = {**ERB_SPEC, "window": "symmetric Hann: 0.5 - 0.5*cos(2*pi*n/(N-1))",
               "frequencyRangeHz": [0, ERB_SPEC["maxHz"]], "absolutePowerDbScale": absolute_scale,
               "differenceDbScale": difference_scale, "source": "fixed-gain WAVs only",
               "stereoPooling": "mean of left and right linear ERB power per time-band cell"}
    analysis_path, analysis_bytes, analysis = None, None, None
    if config.get("sourceAnalysis"):
        analysis_path = package_file(package, config["sourceAnalysis"], "sourceAnalysis")
        analysis_bytes = analysis_path.read_bytes()
        analysis = json.loads(analysis_bytes)
    target_rms = config.get("listeningPostGainTargetRms")
    if target_rms is not None and (isinstance(target_rms, bool) or
            not isinstance(target_rms, (int, float)) or not math.isfinite(target_rms) or
            target_rms <= 0 or target_rms > 1):
        raise ValueError("listeningPostGainTargetRms must be a finite value in (0, 1]")
    target_rms = float(target_rms) if target_rms is not None else None
    post_gain_validation = []
    pair_data, validated_files, parity_checks, seen_ids = [], [], [], set()
    for spec in config["pairs"]:
        if not isinstance(spec, dict):
            raise ValueError("each pair must be an object")
        pair_id = spec.get("id")
        if not isinstance(pair_id, str) or not ID_PATTERN.fullmatch(pair_id) or pair_id in seen_ids:
            raise ValueError(f"invalid or duplicate pair id: {pair_id}")
        seen_ids.add(pair_id)
        source_pair_label = spec.get("sourcePairLabel", pair_id)
        if source_pair_label is not None and not isinstance(source_pair_label, str):
            raise ValueError(f"{pair_id}: sourcePairLabel must be text")
        source_pair = source_pairs.get(source_pair_label) if source_pair_label else None
        if spec.get("contactIndex") is not None:
            if source_pair is None:
                raise ValueError(f"{pair_id}: contactIndex requires a sourcePairLabel")
            if spec["contactIndex"] != source_pair.get("contactIndex"):
                raise ValueError(f"{pair_id}: contactIndex differs from listening manifest")
        pair = {"id": pair_id, "label": spec.get("label", pair_id), "a": {}, "b": {}}
        if not isinstance(pair["label"], str) or not pair["label"].strip():
            raise ValueError(f"{pair_id}: label must be non-empty text")
        for arm in ("a", "b"):
            arm_spec = spec.get(arm)
            if (not isinstance(arm_spec, dict) or not isinstance(arm_spec.get("label"), str) or
                    not arm_spec["label"].strip()):
                raise ValueError(f"{pair_id}: {arm} needs a label")
            pair[arm]["label"] = arm_spec["label"]
            arm_source_label = arm_spec.get("sourcePairLabel", source_pair_label)
            if not isinstance(arm_source_label, str) or arm_source_label not in source_pairs:
                raise ValueError(f"{pair_id}/{arm}: listening manifest has no source {arm_source_label}")
            arm_source_pair = source_pairs[arm_source_label]
            pair[arm]["sourceManifestEntryId"] = arm_source_label
            pair[arm]["measurementMetadata"] = arm_spec.get("measurementMetadata")
            pair[arm]["audio"] = {}
            for mode, path_key, manifest_prefix in (("fixedGain", "fixedGainPath", "fixed-gain:"),
                                                    ("rmsMatchedListeningOnly", "rmsMatchedPath", "rms-matched-listening-only:")):
                path = configured_audio_file(package, arm_spec.get(path_key), f"{pair_id}/{arm} {path_key}",
                                             allow_repository_audio_paths)
                if source_manifest_kind == "pairs":
                    record = next((candidate for key, candidate in arm_source_pair.get("files", {}).items()
                                   if key.startswith(manifest_prefix) and
                                   manifest_file(package, candidate.get("path"), f"{pair_id}/{arm} manifest WAV path",
                                                 allow_repository_path=allow_repository_audio_paths) == path), None)
                else:
                    record_key = "fixed" if mode == "fixedGain" else "levelMatched"
                    candidate = arm_source_pair.get(record_key)
                    record = candidate if candidate and manifest_file(
                        package, candidate.get("path"), f"{pair_id}/{arm} manifest WAV path",
                        allow_repository_path=allow_repository_audio_paths) == path else None
                if not record:
                    raise ValueError(f"{pair_id}/{arm}: {path_key} is absent from the listening manifest")
                receipt = file_receipt(path, package)
                if receipt["bytes"] != record.get("bytes") or receipt["sha256"] != record.get("sha256"):
                    raise ValueError(f"{path}: size or SHA-256 differs from listening-manifest.json")
                record_data = dict(record)
                record_data["sourceManifestEntryId"] = arm_source_label
                record_data["relativePath"] = Path(os.path.relpath(path, output_path.parent)).as_posix()
                record_data["absolutePath"] = str(path)
                pair[arm]["audio"][mode] = record_data
                if receipt["path"] not in {item["path"] for item in validated_files}:
                    validated_files.append(receipt)
        if target_rms is not None:
            matched = [pair[arm]["audio"]["rmsMatchedListeningOnly"] for arm in ("a", "b")]
            levels = []
            for arm, record in zip(("a", "b"), matched):
                source_rms = record.get("rmsAfter", record.get("targetRms"))
                source_peak = record.get("peakAfter", record.get("peak"))
                if (isinstance(source_rms, bool) or not isinstance(source_rms, (int, float)) or
                        not math.isfinite(source_rms) or source_rms <= 0 or
                        isinstance(source_peak, bool) or not isinstance(source_peak, (int, float)) or
                        not math.isfinite(source_peak) or source_peak < 0):
                    raise ValueError(f"{pair_id}/{arm}: matched manifest needs finite positive RMS and peak")
                levels.append((float(source_rms), float(source_peak)))
            if not math.isclose(levels[0][0], levels[1][0], rel_tol=0, abs_tol=1e-12):
                raise ValueError(f"{pair_id}: matched A/B sources do not share one RMS")
            post_gain = target_rms / levels[0][0]
            post_gain_db = 20 * math.log10(post_gain)
            for arm, record, (source_rms, source_peak) in zip(("a", "b"), matched, levels):
                predicted_peak = source_peak * post_gain
                if not math.isfinite(predicted_peak) or predicted_peak >= 1.0:
                    raise ValueError(f"{pair_id}/{arm}: post-gain peak {predicted_peak} reaches full scale")
                metadata = {"sourceMatchedRms": source_rms, "sourceMatchedPeak": source_peak,
                            "finalTargetRms": target_rms, "postGainLinear": post_gain,
                            "postGainDb": post_gain_db, "predictedPostGainPeak": predicted_peak}
                record["listeningPostGain"] = metadata
                post_gain_validation.append({"pairId": pair_id, "arm": arm,
                                             "sourceManifestEntryId": record["sourceManifestEntryId"],
                                             **metadata})
        pair["measurement"] = spec.get("measurement")
        pair["analysisSummary"] = None
        if analysis is not None and spec.get("contactIndex") is not None:
            pair["analysisSummary"] = analysis_summary(analysis, spec["contactIndex"], config.get("analysisWindowMs", 500))
        if erb is not None:
            pair["erbData"], parity = analyze_pair(pair, helper, absolute_scale, difference_scale)
            if parity is not None:
                parity_checks.append(parity)
        for arm in ("a", "b"):
            for record in pair[arm]["audio"].values():
                record.pop("absolutePath", None)
                record.pop("path", None)
        pair_data.append(pair)
    blind_session_cfg = config.get("blindSession")
    blind_session = None
    blind_validation = None
    if blind_session_cfg is not None:
        if not isinstance(blind_session_cfg, dict) or type(blind_session_cfg.get("enabled")) is not bool:
            raise ValueError("blindSession must declare a boolean enabled field")
        if blind_session_cfg["enabled"]:
            public_text = (config["title"] + " " + config.get("metadata", "")).casefold()
            condition_names = {pair[arm]["label"].casefold() for pair in pair_data for arm in ("a", "b")}
            if any(re.search(r"\b" + re.escape(name) + r"\b", public_text) for name in condition_names):
                raise ValueError("blindSession title and metadata must not reveal condition names")
            catch_spec = blind_session_cfg.get("catchTrial")
            if not isinstance(catch_spec, dict):
                raise ValueError("blindSession.catchTrial must be an object")
            catch_id = catch_spec.get("id")
            source_pair_id = catch_spec.get("sourcePairId")
            source_arm = catch_spec.get("sourceArm")
            if (not isinstance(catch_id, str) or not ID_PATTERN.fullmatch(catch_id) or
                    catch_id in seen_ids or source_arm not in ("a", "b")):
                raise ValueError("blindSession.catchTrial has an invalid id or sourceArm")
            source_pair = next((pair for pair in pair_data if pair["id"] == source_pair_id), None)
            if source_pair is None:
                raise ValueError(f"blindSession.catchTrial source pair is missing: {source_pair_id}")
            source = source_pair[source_arm]
            fixed_record = dict(source["audio"]["fixedGain"])
            fixed_record["absolutePath"] = str((output_path.parent / fixed_record["relativePath"]).resolve())
            catch_erb = None
            if erb is not None:
                catch_erb_pair = {"id": catch_id,
                    "a": {"audio": {"fixedGain": fixed_record}},
                    "b": {"audio": {"fixedGain": fixed_record}}}
                catch_erb, _ = analyze_pair(catch_erb_pair, helper, absolute_scale, difference_scale)
            catch_pair = {
                "id": catch_id, "label": "A/A catch trial", "isCatch": True,
                "sourcePairId": source_pair_id, "sourceArm": source_arm,
                "sourceManifestEntryId": source["sourceManifestEntryId"],
                "a": {"label": source["label"], "audio": source["audio"]},
                "b": {"label": source["label"], "audio": source["audio"]},
                "measurement": {"type": "exploratory A/A catch", "sourcePairId": source_pair_id,
                                "sourceArm": source_arm, "sameSourceForBothSides": True},
                "analysisSummary": None,
            }
            if catch_erb is not None:
                catch_pair["erbData"] = catch_erb
            catch_audio_equal = all(
                catch_pair["a"]["audio"][mode]["sha256"] == catch_pair["b"]["audio"][mode]["sha256"]
                and catch_pair["a"]["audio"][mode]["bytes"] == catch_pair["b"]["audio"][mode]["bytes"]
                for mode in ("fixedGain", "rmsMatchedListeningOnly")
            )
            if not catch_audio_equal:
                raise ValueError("A/A catch sides must use byte-identical source files in both listening modes")
            pairing_rule = blind_session_cfg.get("pairingRule")
            if pairing_rule is not None:
                if pairing_rule != "manifest-order-adjacent-v1" or source_manifest_kind != "listening":
                    raise ValueError("pairingRule requires listening-manifest entries and manifest-order-adjacent-v1")
                manifest_order = [row["id"] for row in manifest_rows]
                expected_pairs = [manifest_order[index:index + 2] for index in range(0, len(manifest_order), 2)]
                actual_pairs = [[pair[arm]["sourceManifestEntryId"] for arm in ("a", "b")] for pair in pair_data]
                if len(manifest_order) % 2 or actual_pairs != expected_pairs:
                    raise ValueError("configured pairs must use each listening-manifest entry once in adjacent order")
                if source["sourceManifestEntryId"] != manifest_order[0]:
                    raise ValueError("A/A catch must reuse the first listening-manifest entry")
            pre_reveal_mode = blind_session_cfg.get("preRevealMode")
            if pre_reveal_mode not in (None, "matched-only"):
                raise ValueError("blindSession.preRevealMode must be matched-only when specified")
            blind_session = {"enabled": True, "randomizationAlgorithm": "fnv1a32-xorshift32-fisher-yates-v1",
                             "trialIds": [pair["id"] for pair in pair_data] + [catch_id], "catchTrial": catch_pair,
                             "pairingRule": pairing_rule, "preRevealMode": pre_reveal_mode}
            blind_validation = {"catchTrialId": catch_id, "sourcePairId": source_pair_id,
                                "sourceManifestEntryId": source["sourceManifestEntryId"],
                                "sourceArm": source_arm, "sameBytesAndSha256ForBothSides": catch_audio_equal,
                                "trialCount": len(pair_data) + 1,
                                "betweenSourceCount": len({pair[arm]["sourceManifestEntryId"]
                                    for pair in pair_data for arm in ("a", "b")}),
                                "pairingRule": pairing_rule,
                                "pairingOrder": [[pair[arm]["sourceManifestEntryId"] for arm in ("a", "b")]
                                                  for pair in pair_data] if pairing_rule else None,
                                "preRevealMode": pre_reveal_mode,
                                "fixedGainReceipt": {key: source["audio"]["fixedGain"][key]
                                                     for key in ("relativePath", "bytes", "sha256")},
                                "rmsMatchedReceipt": {key: source["audio"]["rmsMatchedListeningOnly"][key]
                                                       for key in ("relativePath", "bytes", "sha256")}}
    erb_helper_check = helper.self_check() if helper is not None else None
    if helper is not None and not erb_helper_check.get("passed"):
        raise ValueError("reused ERB helper self-check failed")
    data = {"viewerId": config["viewerId"], "evidenceId": config["evidenceId"], "title": config["title"],
            "metadata": config.get("metadata", ""), "pairs": pair_data, "erb": erb,
            "listeningPostGain": {"targetRms": target_rms,
                                  "stage": "after existing RMS-matched listening WAV, before playback",
                                  "meaning": "digital listening target; not calibrated SPL or equal-loudness evidence"}
                if target_rms is not None else None,
            "blindSession": blind_session}
    return data, {"config": file_receipt(config_path, package),
                  "sourceListeningManifest": file_receipt(manifest_path, package),
                  "sourceAnalysis": file_receipt(analysis_path, package) if analysis_path else None,
                  "validatedAudio": validated_files, "erbAnalysisParity": parity_checks,
                  "erbHelper": {"path": ERB_HELPER.relative_to(ROOT).as_posix(),
                                "sha256": sha256(ERB_HELPER.read_bytes()), "selfCheck": erb_helper_check}
                      if erb_helper_check is not None else None,
                  "blindSession": blind_validation, "postGain": post_gain_validation,
                  "sourceManifestKind": source_manifest_kind}


HTML_SCRIPT = r"""
const encodedData = atob(document.getElementById('viewer-data').textContent.trim());
const DATA = JSON.parse(new TextDecoder().decode(Uint8Array.from(encodedData, char => char.charCodeAt(0))));
document.title = DATA.title;
document.getElementById('page-title').textContent = DATA.title;
document.getElementById('evidence-meta').textContent = DATA.metadata || '';
const pairRoot = document.getElementById('pairs');
const modeStatus = document.getElementById('mode-status');
let audioContext = null;
const audioOutputs = new WeakMap();
const modeText = {
  'rms-matched-listening-only': DATA.listeningPostGain
    ? 'RMS matched — character comparison only; digital playback target RMS ' + DATA.listeningPostGain.targetRms + '; not audibility evidence; not calibrated SPL.'
    : 'RMS matched — character comparison only; not audibility evidence.',
  'fixed-gain': 'Fixed gain — amplitude / transfer context.'
};
const modeInputs = Array.from(document.querySelectorAll('input[name="listening-mode"]'));
function selectedMode() { return document.querySelector('input[name="listening-mode"]:checked').value; }
function updateRevealModeStatus() {
  const current = document.querySelector('#reveal-mode-status .current-listening-mode');
  if (current) current.textContent = 'Listening: ' + (selectedMode() === 'fixed-gain' ? 'fixed gain' : 'RMS matched');
}
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function configureAudioGain(audio, record, mode) {
  let output = audioOutputs.get(audio);
  const matchedGain = record.listeningPostGain && record.listeningPostGain.postGainLinear;
  if (!output && (mode === 'fixed-gain' || !matchedGain)) return Promise.resolve();
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) throw new Error('Web Audio API is unavailable in this browser.');
  if (!audioContext) audioContext = new AudioContextType();
  if (!output) {
    const source = audioContext.createMediaElementSource(audio), gain = audioContext.createGain();
    source.connect(gain); gain.connect(audioContext.destination);
    output = { gain }; audioOutputs.set(audio, output);
  }
  output.gain.gain.value = mode === 'fixed-gain' ? 1 : matchedGain || 1;
  return audioContext.state === 'suspended' ? audioContext.resume() : Promise.resolve();
}
function playClip(audio, record, mode, status) {
  audio.pause(); audio.src = record.relativePath; audio.load(); audio.currentTime = 0;
  try {
    const resumed = configureAudioGain(audio, record, mode);
    const playing = audio.play();
    Promise.all([resumed, playing]).catch(error => { status.textContent = 'Playback failed: ' + error.message; });
  } catch (error) { status.textContent = 'Playback failed: ' + error.message; }
}
function keyFor(pair) { return 'ant-audio-evidence-viewer:v1:' + DATA.viewerId + ':' + pair.id; }
function savedNote(pair) {
  try { return JSON.parse(localStorage.getItem(keyFor(pair)) || 'null'); }
  catch (error) { return null; }
}
function scaleColor(value, scale, difference) {
  const t = Math.max(0, Math.min(1, (value - scale[0]) / (scale[1] - scale[0])));
  if (!difference) {
    const c = Math.round(24 + t * 220);
    return 'rgb(' + c + ',' + c + ',' + c + ')';
  }
  const left = [59, 76, 192], mid = [247, 247, 247], right = [180, 4, 38];
  const a = t < 0.5 ? left : mid, b = t < 0.5 ? mid : right, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',') + ')';
}
function drawPanel(canvas, matrix, scale, difference, emptyBands, durationMs) {
  const ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
  const left = 35, top = 10, plotW = width - left - 8, plotH = height - 34;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  const rows = matrix.length ? matrix[0].length : 0, cols = matrix.length;
  for (let band = 0; band < rows; band++) {
    const y = top + (rows - 1 - band) * plotH / rows;
    for (let frame = 0; frame < cols; frame++) {
      const x = left + frame * plotW / cols;
      ctx.fillStyle = emptyBands.includes(band) ? '#aeb4bc' : scaleColor(matrix[frame][band], scale, difference);
      ctx.fillRect(x, y, plotW / cols + 0.5, plotH / rows + 0.5);
    }
  }
  ctx.strokeStyle = '#535d68'; ctx.strokeRect(left, top, plotW, plotH);
  ctx.fillStyle = '#39424c'; ctx.font = '11px system-ui';
  ctx.textAlign = 'right'; ctx.fillText('30', left - 5, top + 8); ctx.fillText('1', left - 5, top + plotH);
  ctx.textAlign = 'left'; ctx.fillText('0 ms', left, height - 7);
  ctx.textAlign = 'right'; ctx.fillText(String(durationMs) + ' ms', left + plotW, height - 7);
}
function updateAudioMode() {
  const mode = selectedMode();
  modeStatus.textContent = modeText[mode];
  document.querySelectorAll('.pair-card,.blind-card').forEach(card => card.querySelectorAll('audio').forEach(audio => {
    audio.pause(); audio.removeAttribute('src'); audio.load();
  }));
  updateRevealModeStatus();
}
function addPair(pair) {
  const card = make('article', 'pair-card'); card.dataset.pairId = pair.id;
  card.innerHTML = '<h2 class="pair-title"></h2><div class="audio-controls"></div><section class="notes"><h3>Subjective note</h3><label>Different? <select data-field="different"><option value="">Choose later</option><option value="yes">Yes</option><option value="unsure">Unsure</option><option value="no">No</option></select></label><label>Free note <textarea data-field="note" rows="3"></textarea></label><button type="button" data-action="save-note">Save note on this device</button><p class="save-status" role="status"></p></section><div class="disclosures"></div>';
  card.querySelector('.pair-title').textContent = pair.label;
  for (const armKey of ['a', 'b']) {
    const arm = pair[armKey], row = make('div', 'audio-row');
    const label = make('strong', '', (armKey === 'a' ? 'A' : 'B') + ' — ' + arm.label);
    const restart = make('button', '', 'Play ' + (armKey === 'a' ? 'A' : 'B') + ' from start');
    restart.type = 'button'; restart.dataset.testid = 'restart-' + armKey;
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none';
    audio.setAttribute('aria-label', (armKey === 'a' ? 'A' : 'B') + ' playback');
    audio.addEventListener('play', () => card.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
    restart.addEventListener('click', () => {
      const clip = arm.audio[selectedMode() === 'fixed-gain' ? 'fixedGain' : 'rmsMatchedListeningOnly'];
      playClip(audio, clip, selectedMode(), card.querySelector('.save-status'));
    });
    row.append(label, restart, audio); card.querySelector('.audio-controls').append(row);
  }
  card.querySelector('[data-action="save-note"]').addEventListener('click', () => {
    const note = { listeningMode: selectedMode(), different: card.querySelector('[data-field="different"]').value,
      note: card.querySelector('[data-field="note"]').value };
    try { localStorage.setItem(keyFor(pair), JSON.stringify(note)); card.querySelector('.save-status').textContent = 'Saved locally in this browser.'; }
    catch (error) { card.querySelector('.save-status').textContent = 'Local storage is unavailable in this browser.'; }
  });
  const prior = savedNote(pair);
  if (prior) {
    card.querySelector('[data-field="different"]').value = prior.different || '';
    card.querySelector('[data-field="note"]').value = prior.note || '';
    card.querySelector('.save-status').textContent = 'Loaded saved local note.';
  }
  const disclosures = card.querySelector('.disclosures');
  if (pair.erbData && DATA.erb) {
    const details = make('details', 'erb-details'), summary = make('summary', '', 'Reveal ERB');
    const panels = make('div', 'erb-panels');
    const panelSpecs = [
      ['A — ' + pair.a.label, pair.erbData.aDb, DATA.erb.absolutePowerDbScale, false],
      ['B — ' + pair.b.label, pair.erbData.bDb, DATA.erb.absolutePowerDbScale, false],
      ['B − A difference', pair.erbData.differenceDb, DATA.erb.differenceDbScale, true]
    ];
    for (const panel of panelSpecs) {
      const figure = document.createElement('figure'), caption = make('figcaption', '', panel[0]);
      const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 210;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', panel[0] + ' ERB-time view');
      figure.append(caption, canvas); panels.append(figure);
    }
    const scaleNote = make('p', 'scale-note', '48 kHz; symmetric Hann FFT 1024; hop 256; 30 equal ERB-rate bands over 0–8 kHz. Fixed-gain WAVs only; left/right linear power is averaged. A/B fixed scale: ' + DATA.erb.absolutePowerDbScale[0] + ' to ' + DATA.erb.absolutePowerDbScale[1] + ' dB power. Difference fixed symmetric scale: ' + DATA.erb.differenceDbScale[0] + ' to +' + DATA.erb.differenceDbScale[1] + ' dB. Band 4 (zero-based index 3) is gray when empty. No per-pair autoscale.');
    details.append(summary, panels, scaleNote);
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const canvases = panels.querySelectorAll('canvas');
      drawPanel(canvases[0], pair.erbData.aDb, DATA.erb.absolutePowerDbScale, false, pair.erbData.emptyBandIndices, pair.erbData.durationMs);
      drawPanel(canvases[1], pair.erbData.bDb, DATA.erb.absolutePowerDbScale, false, pair.erbData.emptyBandIndices, pair.erbData.durationMs);
      drawPanel(canvases[2], pair.erbData.differenceDb, DATA.erb.differenceDbScale, true, pair.erbData.emptyBandIndices, pair.erbData.durationMs);
    });
    disclosures.append(details);
  }
  const measure = make('details', 'measurement-details');
  measure.append(make('summary', '', 'Inspect measurement metadata'));
  const pre = make('pre', 'measurement-json', JSON.stringify({
    fixedGain: { a: pair.a.audio.fixedGain, b: pair.b.audio.fixedGain },
    rmsMatchedListeningOnly: { a: pair.a.audio.rmsMatchedListeningOnly, b: pair.b.audio.rmsMatchedListeningOnly },
    measurementMetadata: pair.measurement || null, analysisSummary: pair.analysisSummary || null
  }, null, 2));
  measure.append(pre); disclosures.append(measure); pairRoot.append(card);
}
function initializeBlindSession() {
  const app = document.getElementById('blind-app'), setup = document.getElementById('session-setup');
  const card = document.getElementById('blind-card'), complete = document.getElementById('blind-complete');
  const exportButton = document.getElementById('export-notes'), exportStatus = document.getElementById('export-status');
  const trialIds = DATA.blindSession.trialIds;
  const matchedModeInput = document.querySelector('input[name="listening-mode"][value="rms-matched-listening-only"]');
  const fixedModeInput = document.querySelector('input[name="listening-mode"][value="fixed-gain"]');
  const fixedModeLabel = fixedModeInput.closest('label');
  const catchId = DATA.blindSession.catchTrial.id, stateKey = 'ant-audio-evidence-viewer:v2:' + DATA.viewerId;
  const algorithm = DATA.blindSession.randomizationAlgorithm;
  const modeNames = { 'rms-matched-listening-only': 'RMS matched', 'fixed-gain': 'fixed gain' };
  const emptyStore = () => ({ schemaVersion: 2, sessions: [], activeSessionId: null });
  function loadStore() {
    try {
      const stored = JSON.parse(localStorage.getItem(stateKey) || 'null');
      return stored && stored.schemaVersion === 2 && Array.isArray(stored.sessions) ? stored : emptyStore();
    } catch (error) { return emptyStore(); }
  }
  let store = loadStore();
  function activeSession() { return store.sessions.find(item => item.sessionId === store.activeSessionId) || null; }
  function timestamp() { return new Date().toISOString(); }
  function logEvent(session, type, trialId = null) {
    session.eventSequence = (session.eventSequence || 0) + 1;
    session.events.push({ sequence: session.eventSequence, timestamp: timestamp(), type, trialId });
  }
  function persist() {
    try { localStorage.setItem(stateKey, JSON.stringify(store)); }
    catch (error) { exportStatus.textContent = 'Browser storage is unavailable; export before closing this page.'; }
  }
  function seedHash(seed) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
    return hash >>> 0 || 0x9e3779b9;
  }
  function seededRandom(seed) {
    let value = seedHash(seed);
    return () => {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }
  function randomSeed() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(2); window.crypto.getRandomValues(values);
      return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
    }
    return Date.now().toString(16) + Math.floor(Math.random() * 0xffffffff).toString(16);
  }
  function shuffled(ids, random) {
    const result = ids.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function definition(id) {
    if (id === catchId) return DATA.blindSession.catchTrial;
    return DATA.pairs.find(pair => pair.id === id);
  }
  function makeSession(seed) {
    const random = seededRandom(seed), order = shuffled(trialIds, random), trials = {};
    for (const [index, id] of order.entries()) {
      const item = definition(id), isCatch = id === catchId;
      let sideMapping;
      if (isCatch) {
        const sameSource = { sourcePairId: item.sourcePairId, sourceArm: item.sourceArm };
        sideMapping = { A: { ...sameSource }, B: { ...sameSource } };
      } else {
        const firstArm = random() < 0.5 ? 'a' : 'b';
        sideMapping = { A: { sourcePairId: id, sourceArm: firstArm },
          B: { sourcePairId: id, sourceArm: firstArm === 'a' ? 'b' : 'a' } };
      }
      trials[id] = { trialSequence: index + 1, sideMapping, isCatch, revealed: false, revealedAt: null,
        openedAt: null, preRevealDraftsByMode: {}, preRevealJudgmentsByMode: {}, postRevealNotesByMode: {} };
    }
    const session = { sessionId: 'aev-' + Date.now().toString(36) + '-' + randomSeed().slice(0, 8), seed,
      randomizationAlgorithm: algorithm, createdAt: timestamp(), trialOrder: order, currentIndex: 0,
      trials, events: [], eventSequence: 0 };
    return session;
  }
  function sessionComplete(session) {
    return !!session && session.trialOrder.every(id => session.trials[id] && session.trials[id].revealed);
  }
  function allSessionsComplete() { return store.sessions.length > 0 && store.sessions.every(sessionComplete); }
  function updateExportState() {
    exportButton.disabled = !allSessionsComplete();
    exportStatus.textContent = exportButton.disabled ? 'Export unlocks after every trial in the session has been revealed.' :
      'Complete sessions export with seed, order, side mapping, audio hashes, and separate mode-specific judgments.';
  }
  function sourceForSide(trialState, side) {
    const ref = trialState.sideMapping[side], pair = DATA.pairs.find(item => item.id === ref.sourcePairId);
    return { ref, pair, arm: pair[ref.sourceArm] };
  }
  function audioRecord(trialState, side, mode) {
    const { arm } = sourceForSide(trialState, side);
    return arm.audio[mode === 'fixed-gain' ? 'fixedGain' : 'rmsMatchedListeningOnly'];
  }
  function applyModeAvailability(trialState) {
    const matchedOnly = DATA.blindSession.preRevealMode === 'matched-only' && !trialState.revealed;
    fixedModeInput.disabled = matchedOnly;
    fixedModeLabel.hidden = matchedOnly;
    if (matchedOnly && selectedMode() !== 'rms-matched-listening-only') {
      matchedModeInput.checked = true;
      updateAudioMode();
      currentListeningMode = 'rms-matched-listening-only';
    }
  }
  function copyReceipt(record) {
    return { path: record.relativePath, bytes: record.bytes, sha256: record.sha256 };
  }
  function recordSnapshot(trialState, mode) {
    const different = card.querySelector('[data-field="different"]');
    const confidence = card.querySelector('[data-field="confidence"]');
    const note = card.querySelector('[data-field="pre-note"]');
    return { listeningMode: mode, different: different.value,
      confidence: confidence.value ? Number(confidence.value) : null, freeNote: note.value,
      timestamp: timestamp(), trialSequence: trialState.trialSequence };
  }
  function validSnapshot(snapshot) {
    return !!snapshot && ['yes', 'unsure', 'no'].includes(snapshot.different) &&
      Number.isInteger(snapshot.confidence) && snapshot.confidence >= 1 && snapshot.confidence <= 5;
  }
  function draftForMode(trialState, mode) {
    return trialState.preRevealDraftsByMode[mode] ||
      (trialState.preRevealJudgmentsByMode[mode] || {}).latest ||
      (trialState.preRevealJudgmentsByMode[mode] || {}).first || null;
  }
  function populatePreReveal(trialState) {
    const mode = selectedMode(), draft = draftForMode(trialState, mode) || {};
    card.querySelector('[data-field="different"]').value = draft.different || '';
    card.querySelector('[data-field="confidence"]').value = draft.confidence ? String(draft.confidence) : '';
    card.querySelector('[data-field="pre-note"]').value = draft.freeNote || '';
    const recorded = (trialState.preRevealJudgmentsByMode[mode] || {}).first;
    card.querySelector('[data-action="save-judgment"]').textContent = recorded ? 'Save another pre-reveal revision' : 'Save blind judgment';
    updatePreRevealButtons();
  }
  function updatePreRevealButtons() {
    const valid = card.querySelector('[data-field="different"]').value &&
      card.querySelector('[data-field="confidence"]').value;
    card.querySelector('[data-action="save-judgment"]').disabled = !valid;
    card.querySelector('[data-action="reveal"]').disabled = !valid;
  }
  function syncDraft(trialState) {
    if (trialState.revealed) return;
    const mode = selectedMode(), snapshot = recordSnapshot(trialState, mode);
    trialState.preRevealDraftsByMode[mode] = { different: snapshot.different, confidence: snapshot.confidence,
      freeNote: snapshot.freeNote, updatedAt: snapshot.timestamp };
    persist(); updatePreRevealButtons();
  }
  function saveBlindJudgment(session, trialId, trialState) {
    const mode = selectedMode(), snapshot = recordSnapshot(trialState, mode);
    if (!validSnapshot(snapshot)) return false;
    const entry = trialState.preRevealJudgmentsByMode[mode] || { first: null, latest: null };
    if (!entry.first) entry.first = snapshot;
    entry.latest = snapshot;
    trialState.preRevealJudgmentsByMode[mode] = entry;
    trialState.preRevealDraftsByMode[mode] = { different: snapshot.different, confidence: snapshot.confidence,
      freeNote: snapshot.freeNote, updatedAt: snapshot.timestamp };
    logEvent(session, 'pre_reveal_judgment_saved', trialId); persist();
    card.querySelector('.save-status').textContent = entry.first === entry.latest ?
      'Blind judgment saved.' : 'Latest saved; first judgment remains preserved.';
    return true;
  }
  function postNoteForMode(trialState, mode) {
    return trialState.postRevealNotesByMode[mode] || { note: '', updatedAt: null };
  }
  function syncPostNote(trialState, session, trialId, mode = selectedMode()) {
    if (!trialState.revealed) return;
    const field = card.querySelector('[data-field="post-note"]');
    const old = postNoteForMode(trialState, mode);
    if (old.note === field.value) return;
    trialState.postRevealNotesByMode[mode] = { listeningMode: mode, note: field.value,
      updatedAt: timestamp(), trialSequence: trialState.trialSequence };
    logEvent(session, 'post_reveal_note_updated', trialId); persist();
  }
  function renderPreRevealSummary(trialState) {
    const target = card.querySelector('.pre-reveal-summary'); target.replaceChildren();
    for (const mode of ['rms-matched-listening-only', 'fixed-gain']) {
      const entry = trialState.preRevealJudgmentsByMode[mode];
      if (!entry || !entry.first) continue;
      const box = make('section', 'judgment-record');
      box.append(make('strong', '', modeNames[mode] + ' — first pre-reveal judgment'));
      box.append(make('p', '', 'Different: ' + entry.first.different + '; confidence: ' + entry.first.confidence + '/5'));
      if (entry.first.freeNote) box.append(make('p', '', 'First note: ' + entry.first.freeNote));
      if (entry.latest && (entry.latest.different !== entry.first.different ||
          entry.latest.confidence !== entry.first.confidence || entry.latest.freeNote !== entry.first.freeNote)) {
        box.append(make('p', '', 'Latest pre-reveal revision: ' + entry.latest.different + '; confidence: ' +
          entry.latest.confidence + '/5; note: ' + entry.latest.freeNote));
      }
      box.append(make('p', 'save-status', 'Recorded ' + entry.first.timestamp)); target.append(box);
    }
    if (!target.childElementCount) target.textContent = 'No blind judgment was recorded for this trial.';
  }
  function renderErb(pair, trialState) {
    const details = make('details', 'erb-details'); details.open = true;
    details.append(make('summary', '', 'Fixed-gain A / B / difference ERB'));
    const panels = make('div', 'erb-panels');
    let aData, bData, difference = pair.erbData.differenceDb;
    if (pair.isCatch) { aData = pair.erbData.aDb; bData = pair.erbData.bDb; }
    else {
      aData = trialState.sideMapping.A.sourceArm === 'a' ? pair.erbData.aDb : pair.erbData.bDb;
      bData = trialState.sideMapping.B.sourceArm === 'a' ? pair.erbData.aDb : pair.erbData.bDb;
      if (trialState.sideMapping.A.sourceArm === 'b') difference = difference.map(row => row.map(value => -value));
    }
    const armA = sourceForSide(trialState, 'A').arm, armB = sourceForSide(trialState, 'B').arm;
    const specs = [['A — ' + armA.label, aData, DATA.erb.absolutePowerDbScale, false],
      ['B — ' + armB.label, bData, DATA.erb.absolutePowerDbScale, false],
      ['B − A difference', difference, DATA.erb.differenceDbScale, true]];
    for (const [captionText, matrix, scale, isDifference] of specs) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas');
      canvas.width = 440; canvas.height = 210; canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', captionText + ' ERB-time view');
      figure.append(make('figcaption', '', captionText), canvas); panels.append(figure);
      drawPanel(canvas, matrix, scale, isDifference, pair.erbData.emptyBandIndices, pair.erbData.durationMs);
    }
    details.append(panels, make('p', 'scale-note', 'Analysis view: fixed gain. 48 kHz; symmetric Hann FFT 1024; hop 256; 30 equal ERB-rate bands over 0–8 kHz. Fixed-gain WAVs only; left/right linear power is averaged. A/B fixed scale: ' + DATA.erb.absolutePowerDbScale[0] + ' to ' + DATA.erb.absolutePowerDbScale[1] + ' dB power. Difference fixed symmetric scale: ' + DATA.erb.differenceDbScale[0] + ' to +' + DATA.erb.differenceDbScale[1] + ' dB. No per-pair autoscale.'));
    return details;
  }
  function mappingForExport(trialState, side) {
    const { ref, pair, arm } = sourceForSide(trialState, side);
    return { condition: arm.label, sourcePairId: ref.sourcePairId, sourceArm: ref.sourceArm,
      sourceManifestEntryId: arm.sourceManifestEntryId,
      measurementMetadata: arm.measurementMetadata || null,
      playbackMetadata: { modeAtReveal: trialState.listeningModeAtReveal, fixedGainLinear: 1,
        matchedPostGain: arm.audio.rmsMatchedListeningOnly.listeningPostGain || null },
      audioFileHashes: { fixedGain: copyReceipt(arm.audio.fixedGain),
        rmsMatchedListeningOnly: copyReceipt(arm.audio.rmsMatchedListeningOnly) } };
  }
  function revealTrial(pair, trialState, trialId) {
    const sideA = sourceForSide(trialState, 'A'), sideB = sourceForSide(trialState, 'B');
    const identity = card.querySelector('.revealed-identity');
    if (pair.isCatch) {
      identity.textContent = 'A/A catch trial — A and B use the exact same ' + sideA.arm.label + ' source from ' +
        pair.sourcePairId + '. Exploratory difference-seeking control; not a formal psychophysical test.';
    } else identity.textContent = pair.label + ' — A: ' + sideA.arm.label + '; B: ' + sideB.arm.label + '.';
    updateRevealModeStatus();
    const analysis = card.querySelector('.revealed-analysis-content');
    analysis.replaceChildren();
    if (pair.erbData && DATA.erb) analysis.append(renderErb(pair, trialState));
    const measure = make('details', 'measurement-details'); measure.open = true;
    measure.append(make('summary', '', 'Inspect measurement metadata'));
    measure.append(make('pre', 'measurement-json', JSON.stringify({
      listeningModeAtReveal: selectedMode(), analysisView: 'fixed gain', isExploratoryAaCatch: pair.isCatch,
      listeningPostGain: DATA.listeningPostGain,
      sideMapping: { A: mappingForExport(trialState, 'A'), B: mappingForExport(trialState, 'B') },
      measurementMetadata: pair.measurement || null, analysisSummary: pair.analysisSummary || null
    }, null, 2)));
    analysis.append(measure);
    renderPreRevealSummary(trialState);
    const post = card.querySelector('[data-field="post-note"]');
    post.value = postNoteForMode(trialState, selectedMode()).note || '';
    post.disabled = false;
    post.addEventListener('input', () => syncPostNote(trialState, activeSession(), trialId));
  }
  function renderTrial(session) {
    const id = session.trialOrder[session.currentIndex], pair = definition(id), trialState = session.trials[id];
    applyModeAvailability(trialState);
    if (!trialState.openedAt) { trialState.openedAt = timestamp(); logEvent(session, 'trial_opened', id); persist(); }
    complete.hidden = true; card.hidden = false;
    card.innerHTML = '<h2 class="pair-title"></h2><div class="audio-controls"></div><section class="pre-reveal"><h3>Before reveal</h3><p>Choose whether A and B sound different, rate confidence, and add an optional note. No sound descriptors are suggested.</p><label>Different? <select data-field="different"><option value="">Choose one</option><option value="yes">Yes</option><option value="unsure">Unsure</option><option value="no">No</option></select></label><label>Confidence (1–5) <select data-field="confidence"><option value="">Choose one</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><label>Free note <textarea data-field="pre-note" rows="3"></textarea></label><button type="button" data-action="save-judgment">Save blind judgment</button> <button type="button" data-action="reveal">Reveal analysis</button><p class="save-status" role="status"></p></section><section class="revealed-analysis" hidden><h3>Revealed identity</h3><p class="revealed-identity"></p><div id="reveal-mode-status" class="mode-status"><p class="current-listening-mode"></p><p class="analysis-view">Analysis view: fixed gain</p></div><section class="pre-reveal-records"><h4>Preserved pre-reveal judgments</h4><div class="pre-reveal-summary"></div></section><label>Post-reveal note <textarea data-field="post-note" rows="3" placeholder="Optional interpretation after analysis"></textarea></label><div class="revealed-analysis-content"></div></section>';
    card.querySelector('.pair-title').textContent = 'Trial ' + (session.currentIndex + 1) + ' of ' + session.trialOrder.length;
    for (const side of ['A', 'B']) {
      const row = make('div', 'audio-row'), label = make('strong', '', side);
      const restart = make('button', '', 'Play ' + side + ' from start'); restart.type = 'button';
      restart.dataset.testid = 'restart-' + side.toLowerCase();
      const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.setAttribute('aria-label', side + ' playback');
      audio.addEventListener('play', () => card.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
      restart.addEventListener('click', () => {
        const record = audioRecord(trialState, side, selectedMode());
        playClip(audio, record, selectedMode(), card.querySelector('.save-status'));
      });
      row.append(label, restart, audio); card.querySelector('.audio-controls').append(row);
    }
    for (const field of ['different', 'confidence', 'pre-note']) {
      card.querySelector('[data-field="' + field + '"]').addEventListener('input', () => syncDraft(trialState));
      card.querySelector('[data-field="' + field + '"]').addEventListener('change', () => syncDraft(trialState));
    }
    card.querySelector('[data-action="save-judgment"]').addEventListener('click', () => saveBlindJudgment(session, id, trialState));
    card.querySelector('[data-action="reveal"]').addEventListener('click', () => {
      if (!saveBlindJudgment(session, id, trialState)) return;
      trialState.revealed = true; trialState.revealedAt = timestamp();
      trialState.listeningModeAtReveal = selectedMode(); logEvent(session, 'analysis_revealed', id); persist();
      renderBlindSession();
    });
    populatePreReveal(trialState);
    const nav = document.getElementById('trial-navigation'); nav.hidden = false;
    const previous = document.getElementById('previous-trial'), next = document.getElementById('next-trial');
    previous.disabled = session.currentIndex === 0;
    next.disabled = !trialState.revealed; next.textContent = session.currentIndex === session.trialOrder.length - 1 ? 'Finish session' : 'Next trial';
    previous.onclick = () => { syncPostNoteIfShown(); session.currentIndex--; logEvent(session, 'trial_reviewed', session.trialOrder[session.currentIndex]); persist(); renderBlindSession(); };
    next.onclick = () => { syncPostNoteIfShown(); session.currentIndex++; logEvent(session, 'trial_advanced', id); persist(); renderBlindSession(); };
    if (trialState.revealed) {
      card.querySelector('.pre-reveal').hidden = true;
      card.querySelector('.revealed-analysis').hidden = false;
      revealTrial(pair, trialState, id);
      updateRevealModeStatus();
    }
    document.getElementById('session-meta').textContent = 'Session ' + session.sessionId + ' · Trial ' +
      (session.currentIndex + 1) + ' of ' + session.trialOrder.length;
    updateExportState();
  }
  function syncPostNoteIfShown() {
    const session = activeSession();
    if (!session || session.currentIndex >= session.trialOrder.length) return;
    const trialId = session.trialOrder[session.currentIndex], trialState = session.trials[trialId];
    if (trialState.revealed) syncPostNote(trialState, session, trialId);
  }
  function renderBlindSession() {
    const session = activeSession();
    setup.hidden = !!session; app.hidden = false;
    document.getElementById('trial-navigation').hidden = true;
    if (!session) { card.hidden = true; complete.hidden = true; document.getElementById('session-meta').textContent = 'Start a randomized session to begin.'; updateExportState(); return; }
    if (session.currentIndex >= session.trialOrder.length) {
      card.hidden = true; complete.hidden = false; document.getElementById('trial-navigation').hidden = true;
      complete.querySelector('.completion-summary').textContent = 'Session complete. Seed for reproduction: ' + session.seed +
        ' (' + session.randomizationAlgorithm + '). Earlier sessions remain in local history.';
      complete.querySelector('[data-action="review-last"]').onclick = () => { session.currentIndex = session.trialOrder.length - 1; persist(); renderBlindSession(); };
      document.getElementById('session-meta').textContent = 'Session ' + session.sessionId + ' · Complete';
      updateExportState(); return;
    }
    renderTrial(session);
  }
  function exportReceipt(record) { return copyReceipt(record); }
  function exportTrial(session, id) {
    const item = definition(id), trialState = session.trials[id];
    const mapping = trialState.revealed ? { A: mappingForExport(trialState, 'A'), B: mappingForExport(trialState, 'B') } : null;
    return { trialId: id, trialSequence: trialState.trialSequence, isCatch: trialState.revealed ? trialState.isCatch : null,
      revealed: trialState.revealed, openedAt: trialState.openedAt, revealedAt: trialState.revealedAt,
      listeningModeAtReveal: trialState.listeningModeAtReveal || null, sideMapping: mapping,
      audioFileHashes: mapping ? { A: mapping.A.audioFileHashes, B: mapping.B.audioFileHashes } : null,
      preRevealJudgmentsByMode: trialState.preRevealJudgmentsByMode,
      postRevealNotesByMode: trialState.postRevealNotesByMode };
  }
  function exportPayload() {
    syncPostNoteIfShown();
    return { schemaVersion: 2, viewerId: DATA.viewerId, evidenceId: DATA.evidenceId, exportedAt: timestamp(),
      listeningPostGain: DATA.listeningPostGain,
      sessions: store.sessions.map(session => ({ sessionId: session.sessionId, seed: session.seed,
        randomizationAlgorithm: session.randomizationAlgorithm, startedAt: session.createdAt,
        completed: sessionComplete(session), trialOrder: session.trialOrder.slice(),
        trials: session.trialOrder.map(id => exportTrial(session, id)), events: session.events.slice() })) };
  }
  function exportSession() {
    if (!allSessionsComplete()) return;
    const session = activeSession(); logEvent(session, 'session_exported'); persist();
    const payload = exportPayload(), url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = make('a'); link.href = url; link.download = DATA.evidenceId + '-subjective-listening.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('start-session').addEventListener('click', () => {
    const session = makeSession(randomSeed());
    store.sessions.push(session); store.activeSessionId = session.sessionId;
    logEvent(session, 'session_started'); persist(); renderBlindSession();
  });
  document.getElementById('new-session').addEventListener('click', () => {
    setup.hidden = false; complete.hidden = true; card.hidden = true;
    document.getElementById('session-meta').textContent = 'Previous sessions remain saved.';
  });
  exportButton.textContent = 'Export subjective listening JSON';
  exportButton.addEventListener('click', exportSession);
  let currentListeningMode = selectedMode();
  modeInputs.forEach(input => input.addEventListener('change', () => {
    const nextMode = selectedMode();
    const session = activeSession();
    if (!session || session.currentIndex >= session.trialOrder.length) { currentListeningMode = nextMode; return; }
    const trialState = session.trials[session.trialOrder[session.currentIndex]];
    if (trialState.revealed) {
      syncPostNote(trialState, session, session.trialOrder[session.currentIndex], currentListeningMode);
      const field = card.querySelector('[data-field="post-note"]');
      if (field) field.value = postNoteForMode(trialState, nextMode).note || '';
    } else populatePreReveal(trialState);
    currentListeningMode = nextMode;
  }));
  if (DATA.blindSession.preRevealMode === 'matched-only') applyModeAvailability({ revealed: false });
  renderBlindSession();
}
if (DATA.blindSession && DATA.blindSession.enabled) {
  document.getElementById('pairs').hidden = true;
  initializeBlindSession();
} else {
  DATA.pairs.forEach(addPair);
  document.getElementById('export-notes').addEventListener('click', () => {
  const payload = { schemaVersion: 1, viewerId: DATA.viewerId, evidenceId: DATA.evidenceId,
    pairs: DATA.pairs.map(pair => {
      const saved = savedNote(pair) || {};
      const card = document.querySelector('[data-pair-id="' + pair.id + '"]');
      return { pairId: pair.id, listeningMode: saved.listeningMode || selectedMode(),
        different: saved.different || card.querySelector('[data-field="different"]').value,
        note: saved.note !== undefined ? saved.note : card.querySelector('[data-field="note"]').value };
    }) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = make('a'); link.href = url; link.download = DATA.evidenceId + '-subjective-notes.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
modeInputs.forEach(input => input.addEventListener('change', updateAudioMode));
if (DATA.listeningPostGain) document.querySelector('.footer').textContent +=
  ' Matched playback post-gain is listening convenience only; target is digital RMS, not calibrated SPL.';
updateAudioMode();
"""


def render_html(data):
    embedded = base64.b64encode(json.dumps(data, ensure_ascii=False, separators=(",", ":"),
                                              allow_nan=False).encode("utf-8")).decode("ascii")
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script id="viewer-data" type="application/octet-stream">__VIEWER_DATA__</script>
<title></title><style>
:root{color-scheme:light;font:16px/1.5 system-ui,sans-serif;color:#202a33;background:#f4f6f8}body{max-width:1100px;margin:2rem auto;padding:0 1rem}h1{font-size:1.7rem}.intro,.pair-card,.blind-card,#blind-complete{background:white;border:1px solid #ccd3da;border-radius:8px;padding:1rem;margin:1rem 0}.intro p{margin:.45rem 0}.pair-card h2,.blind-card h2{font-size:1.2rem;margin:0 0 .8rem}.audio-row{display:grid;grid-template-columns:minmax(4rem,1fr) auto minmax(16rem,2fr);gap:.7rem;align-items:center;padding:.55rem 0;border-top:1px solid #e3e7eb}.audio-row audio{width:100%}button,select,textarea,input{font:inherit}button{padding:.4rem .65rem}fieldset{border:1px solid #ccd3da;border-radius:6px;margin:.8rem 0;padding:.7rem}.mode-option{display:block}.mode-status,.scale-note,.save-status,.footer{color:#52606d;font-size:.92rem}.notes{border-top:1px solid #dce1e6;margin-top:1rem;padding-top:.7rem}.notes h3{font-size:1rem;margin:.25rem 0}.notes label,.blind-card label{display:block;margin:.55rem 0}.notes textarea,.blind-card textarea{display:block;width:min(100%,44rem);box-sizing:border-box;margin-top:.25rem}details{border-top:1px solid #e3e7eb;padding:.7rem 0}summary{cursor:pointer;font-weight:600}.erb-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.erb-panels figure{margin:.3rem 0;min-width:0}.erb-panels figcaption{font-weight:600;margin-bottom:.25rem}.erb-panels canvas{display:block;width:100%;height:auto;border:1px solid #aeb6bf}.measurement-json{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f9;padding:.65rem;font-size:.8rem}.judgment-record{border:1px solid #e3e7eb;border-radius:5px;margin:.5rem 0;padding:.5rem}.session-setup{border-top:1px solid #e3e7eb;margin-top:.8rem;padding-top:.8rem}#trial-navigation{display:flex;gap:.6rem;margin:1rem 0}#export-notes{margin:1rem 0}.footer{font-size:.85rem}@media(max-width:760px){.audio-row{grid-template-columns:1fr}.erb-panels{grid-template-columns:1fr}}
</style></head><body><main><h1 id="page-title"></h1><section class="intro"><p id="evidence-meta"></p><fieldset><legend>Listening mode</legend><label class="mode-option"><input type="radio" name="listening-mode" value="rms-matched-listening-only" checked> RMS matched — listening-only character comparison</label><label class="mode-option"><input type="radio" name="listening-mode" value="fixed-gain"> Fixed gain — amplitude / transfer context</label><p id="mode-status" class="mode-status"></p></fieldset><section id="session-setup" class="session-setup"><button id="start-session" type="button">Start randomized blind session</button></section><p id="session-meta" class="mode-status"></p></section><section id="blind-app" hidden aria-label="Blind audio evidence session"><article id="blind-card" class="blind-card" hidden></article><nav id="trial-navigation" hidden aria-label="Trial navigation"><button id="previous-trial" type="button">Previous trial</button><button id="next-trial" type="button">Next trial</button></nav><section id="blind-complete" hidden><h2>Session complete</h2><p class="completion-summary"></p><button data-action="review-last" type="button">Review last trial</button> <button id="new-session" type="button">Start another randomized session</button></section></section><section id="pairs" aria-label="A/B listening pairs"></section><button id="export-notes" type="button">Export subjective notes JSON</button><p id="export-status" class="mode-status"></p><p class="footer">Subjective notes stay in this browser until explicit export and remain separate from measurement evidence. RMS-matched playback is not audibility evidence. ERB analysis always uses fixed-gain source files only.</p></main><script>__VIEWER_SCRIPT__</script></body></html>
""".replace("__VIEWER_SCRIPT__", HTML_SCRIPT).replace("__VIEWER_DATA__", embedded)


def refresh_report_manifest(package):
    manifest_path = package / "report-manifest.json"
    if not manifest_path.exists():
        return 0
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    artifacts = []
    for path in sorted(package.rglob("*"), key=lambda item: item.relative_to(ROOT).as_posix()):
        if not path.is_file() or path == manifest_path:
            continue
        data = path.read_bytes()
        entry = {"path": path.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": sha256(data)}
        if path.suffix.lower() == ".png":
            if data[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError(f"{path}: invalid PNG signature")
            entry["pixels"] = list(struct.unpack_from(">II", data, 16))
        artifacts.append(entry)
    manifest["artifacts"] = artifacts
    manifest_path.write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    return len(artifacts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("viewer_config", type=Path)
    args = parser.parse_args()
    config_path = args.viewer_config.resolve()
    package = config_path.parent.resolve()
    if not config_path.is_relative_to(ROOT):
        raise ValueError("viewer config must be inside this repository")
    config_bytes = config_path.read_bytes()
    config = json.loads(config_bytes)
    helper = load_helper() if config.get("erb") is not None else None
    data, inputs = build_data(config, config_path, package, helper)
    html = render_html(data).encode("utf-8")
    if html != render_html(data).encode("utf-8"):
        raise ValueError("HTML generation is not deterministic")
    html_path = package_file(package, config["output"], "output")
    html_path.write_bytes(html)
    html_hash = sha256(html)
    tool_hash = sha256(Path(__file__).read_bytes())
    validation = {
        "schemaVersion": 1, "viewerId": data["viewerId"], "evidenceId": data["evidenceId"],
        "generator": {"path": Path(__file__).resolve().relative_to(ROOT).as_posix(), "sha256": tool_hash,
                      "python": platform.python_version()},
        "config": inputs["config"], "listeningManifest": inputs["sourceListeningManifest"],
        "analysis": inputs["sourceAnalysis"], "erbHelper": inputs["erbHelper"],
        "fixedGainOnlyErbAnalysis": data["erb"] is not None, "validatedAudioFiles": inputs["validatedAudio"],
        "erbAnalysisParity": inputs["erbAnalysisParity"],
        "blindSession": inputs["blindSession"],
        "sourceManifestKind": inputs["sourceManifestKind"],
        "listeningPostGain": {"targetRms": data["listeningPostGain"]["targetRms"],
                               "sources": inputs["postGain"],
                               "allPredictedPeaksBelowFullScale": all(
                                   row["predictedPostGainPeak"] < 1 for row in inputs["postGain"])}
            if data["listeningPostGain"] else None,
        "erbDisplay": {"specification": ERB_SPEC, "absolutePowerDbScale": data["erb"]["absolutePowerDbScale"] if data["erb"] else None,
                        "differenceDbScale": data["erb"]["differenceDbScale"] if data["erb"] else None,
                        "perPairAutoscale": False if data["erb"] else None},
        "html": {"path": html_path.relative_to(package).as_posix(), "bytes": len(html), "sha256": html_hash},
        "noAudioRenderOrSourceModification": True,
    }
    validation_path = package_file(package, config.get("validationOutput", "viewer-validation.json"), "validation output")
    validation_path.write_text(json.dumps(validation, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    report_artifacts = refresh_report_manifest(package)
    print(json.dumps({"htmlPath": validation["html"]["path"], "htmlBytes": len(html), "htmlSha256": html_hash,
                      "validatedAudioFiles": len(inputs["validatedAudio"]), "validationPath": str(validation_path),
                      "reportManifestArtifactCount": report_artifacts}, indent=2))


if __name__ == "__main__":
    main()
