#!/usr/bin/env python3
"""Generate a self-contained ANT A/B audio evidence viewer from a small config."""
import argparse
import hashlib
import json
import math
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
    return {"path": path.relative_to(package).as_posix(), "bytes": len(data), "sha256": sha256(data)}


def package_file(package, value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a relative path")
    path = (package / value).resolve()
    if not path.is_relative_to(package.resolve()):
        raise ValueError(f"{label} escapes the evidence package")
    return path


def manifest_file(package, value, label):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError(f"{label} must be a repository-relative path")
    path = (ROOT / value).resolve()
    if not path.is_relative_to(package.resolve()):
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
    manifest_path = package_file(package, config["sourceListeningManifest"], "sourceListeningManifest")
    manifest_bytes = manifest_path.read_bytes()
    listening_manifest = json.loads(manifest_bytes)
    source_pairs = {row["label"]: row for row in listening_manifest.get("pairs", [])}
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
    pair_data, validated_files, parity_checks, seen_ids = [], [], [], set()
    for spec in config["pairs"]:
        if not isinstance(spec, dict):
            raise ValueError("each pair must be an object")
        pair_id = spec.get("id")
        if not isinstance(pair_id, str) or not ID_PATTERN.fullmatch(pair_id) or pair_id in seen_ids:
            raise ValueError(f"invalid or duplicate pair id: {pair_id}")
        seen_ids.add(pair_id)
        source_pair_label = spec.get("sourcePairLabel", pair_id)
        if not isinstance(source_pair_label, str):
            raise ValueError(f"{pair_id}: sourcePairLabel must be text")
        source_pair = source_pairs.get(source_pair_label)
        if source_pair is None:
            raise ValueError(f"listening manifest has no source pair {source_pair_label}")
        if spec.get("contactIndex") is not None and spec["contactIndex"] != source_pair.get("contactIndex"):
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
            pair[arm]["audio"] = {}
            for mode, path_key, manifest_prefix in (("fixedGain", "fixedGainPath", "fixed-gain:"),
                                                    ("rmsMatchedListeningOnly", "rmsMatchedPath", "rms-matched-listening-only:")):
                path = package_file(package, arm_spec.get(path_key), f"{pair_id}/{arm} {path_key}")
                record = next((candidate for key, candidate in source_pair.get("files", {}).items()
                               if key.startswith(manifest_prefix) and
                               manifest_file(package, candidate.get("path"), f"{pair_id}/{arm} manifest WAV path") == path), None)
                if not record:
                    raise ValueError(f"{pair_id}/{arm}: {path_key} is absent from the listening manifest")
                receipt = file_receipt(path, package)
                if receipt["bytes"] != record.get("bytes") or receipt["sha256"] != record.get("sha256"):
                    raise ValueError(f"{path}: size or SHA-256 differs from listening-manifest.json")
                record_data = dict(record)
                record_data["relativePath"] = receipt["path"]
                record_data["absolutePath"] = str(path)
                pair[arm]["audio"][mode] = record_data
                if receipt["path"] not in {item["path"] for item in validated_files}:
                    validated_files.append(receipt)
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
    erb_helper_check = helper.self_check()
    if not erb_helper_check.get("passed"):
        raise ValueError("reused ERB helper self-check failed")
    data = {"viewerId": config["viewerId"], "evidenceId": config["evidenceId"], "title": config["title"],
            "metadata": config.get("metadata", ""), "pairs": pair_data, "erb": erb}
    return data, {"config": file_receipt(config_path, package),
                  "sourceListeningManifest": file_receipt(manifest_path, package),
                  "sourceAnalysis": file_receipt(analysis_path, package) if analysis_path else None,
                  "validatedAudio": validated_files, "erbAnalysisParity": parity_checks,
                  "erbHelper": {"path": ERB_HELPER.relative_to(ROOT).as_posix(),
                                "sha256": sha256(ERB_HELPER.read_bytes()), "selfCheck": erb_helper_check}}


HTML_SCRIPT = r"""
const DATA = JSON.parse(document.getElementById('viewer-data').textContent);
document.title = DATA.title;
document.getElementById('page-title').textContent = DATA.title;
document.getElementById('evidence-meta').textContent = DATA.metadata || '';
const pairRoot = document.getElementById('pairs');
const modeStatus = document.getElementById('mode-status');
const modeText = {
  'rms-matched-listening-only': 'RMS matched — character comparison only; not audibility evidence.',
  'fixed-gain': 'Fixed gain — amplitude / transfer context.'
};
const modeInputs = Array.from(document.querySelectorAll('input[name="listening-mode"]'));
function selectedMode() { return document.querySelector('input[name="listening-mode"]:checked').value; }
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  document.querySelectorAll('.pair-card').forEach(card => card.querySelectorAll('audio').forEach(audio => {
    audio.pause(); audio.removeAttribute('src'); audio.load();
  }));
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
      audio.pause(); audio.src = clip.relativePath; audio.load(); audio.currentTime = 0;
      audio.play().catch(error => { card.querySelector('.save-status').textContent = 'Playback failed: ' + error.message; });
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
DATA.pairs.forEach(addPair);
modeInputs.forEach(input => input.addEventListener('change', updateAudioMode));
updateAudioMode();
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
"""


def render_html(data):
    embedded = json.dumps(data, ensure_ascii=False, indent=1, allow_nan=False)
    embedded = embedded.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title></title><style>
:root{color-scheme:light;font:16px/1.5 system-ui,sans-serif;color:#202a33;background:#f4f6f8}body{max-width:1100px;margin:2rem auto;padding:0 1rem}h1{font-size:1.7rem}.intro,.pair-card{background:white;border:1px solid #ccd3da;border-radius:8px;padding:1rem;margin:1rem 0}.intro p{margin:.45rem 0}.pair-card h2{font-size:1.2rem;margin:0 0 .8rem}.audio-row{display:grid;grid-template-columns:minmax(7rem,1fr) auto minmax(16rem,2fr);gap:.7rem;align-items:center;padding:.55rem 0;border-top:1px solid #e3e7eb}.audio-row audio{width:100%}button,select,textarea{font:inherit}button{padding:.4rem .65rem}fieldset{border:1px solid #ccd3da;border-radius:6px;margin:.8rem 0;padding:.7rem}.mode-option{display:block}.mode-status,.scale-note,.save-status{color:#52606d;font-size:.92rem}.notes{border-top:1px solid #dce1e6;margin-top:1rem;padding-top:.7rem}.notes h3{font-size:1rem;margin:.25rem 0}.notes label{display:block;margin:.55rem 0}.notes textarea{display:block;width:min(100%,44rem);box-sizing:border-box;margin-top:.25rem}.disclosures{margin-top:.7rem}details{border-top:1px solid #e3e7eb;padding:.7rem 0}summary{cursor:pointer;font-weight:600}.erb-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.erb-panels figure{margin:.3rem 0;min-width:0}.erb-panels figcaption{font-weight:600;margin-bottom:.25rem}.erb-panels canvas{display:block;width:100%;height:auto;border:1px solid #aeb6bf}.measurement-json{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f9;padding:.65rem;font-size:.8rem}#export-notes{margin:1rem 0}.footer{font-size:.85rem;color:#52606d}@media(max-width:760px){.audio-row{grid-template-columns:1fr}.erb-panels{grid-template-columns:1fr}}
</style></head><body><main><h1 id="page-title"></h1><section class="intro"><p id="evidence-meta"></p><fieldset><legend>Listening mode</legend><label class="mode-option"><input type="radio" name="listening-mode" value="rms-matched-listening-only" checked> RMS matched — listening-only character comparison</label><label class="mode-option"><input type="radio" name="listening-mode" value="fixed-gain"> Fixed gain — amplitude / transfer context</label><p id="mode-status" class="mode-status"></p></fieldset></section><section id="pairs" aria-label="A/B listening pairs"></section><button id="export-notes" type="button">Export subjective notes JSON</button><p class="footer">Notes stay in this browser until exported. They are subjective observations, separate from measurement evidence. No human listening result is inferred or written into the evidence package.</p></main><script id="viewer-data" type="application/json">__VIEWER_DATA__</script><script>__VIEWER_SCRIPT__</script></body></html>
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
    helper = load_helper()
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
        "fixedGainOnlyErbAnalysis": True, "validatedAudioFiles": inputs["validatedAudio"],
        "erbAnalysisParity": inputs["erbAnalysisParity"],
        "erbDisplay": {"specification": ERB_SPEC, "absolutePowerDbScale": data["erb"]["absolutePowerDbScale"] if data["erb"] else None,
                        "differenceDbScale": data["erb"]["differenceDbScale"] if data["erb"] else None,
                        "perPairAutoscale": False if data["erb"] else None},
        "html": {"path": html_path.relative_to(package).as_posix(), "bytes": len(html), "sha256": html_hash},
        "noAudioRenderOrSourceModification": True,
    }
    validation_path = package_file(package, "viewer-validation.json", "validation output")
    validation_path.write_text(json.dumps(validation, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    report_artifacts = refresh_report_manifest(package)
    print(json.dumps({"htmlPath": validation["html"]["path"], "htmlBytes": len(html), "htmlSha256": html_hash,
                      "validatedAudioFiles": len(inputs["validatedAudio"]), "validationPath": str(validation_path),
                      "reportManifestArtifactCount": report_artifacts}, indent=2))


if __name__ == "__main__":
    main()
