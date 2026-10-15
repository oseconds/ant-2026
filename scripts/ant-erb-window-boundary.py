#!/usr/bin/env python3
"""Frozen-PCM sensitivity to Hann crop-boundary coverage; no render or tuning."""
import argparse
import hashlib
import importlib.util
import json
import platform
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/ant/evidence/2026-10-15-erb-window-boundary"
PRIOR = ROOT / "docs/ant/evidence/2026-10-14-base-born-natural-event-erb/analysis.json"
BASELINE = "a9c138e8fff3ebfec45c09f2f391d8e6f5aedfdd"
POLICIES = ("legacy", "covered-crop", "covered-context")


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SOURCE = load("ant-base-born-natural-event-erb")
ERB = SOURCE.load_helper()
N, HOP = ERB.FFT_SIZE, ERB.HOP_SIZE


def receipt(path):
    raw = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest()}


def covered(stream, anchor, length, context=False):
    """Reuse the unchanged STFT on an exactly framed padded segment."""
    if not 0 <= anchor < anchor + length <= len(stream):
        raise ValueError("Expected a complete positive-length window inside the stream")
    starts = np.arange(-N + HOP, length, HOP, dtype=int)
    left, right = anchor + int(starts[0]), anchor + int(starts[-1]) + N
    segment = np.zeros((right - left, 2), dtype=np.float64)
    low, high = (0, len(stream)) if context else (anchor, anchor + length)
    lo, hi = max(left, low), min(right, high)
    segment[lo - left:hi - left] = stream[lo:hi]
    result = ERB.erb_aggregate(ERB.stft_power(segment))[0].mean(axis=2)
    assert len(result) == len(starts)
    return result, starts, {"beforeStreamSamples": max(0, -left),
                           "afterStreamSamples": max(0, right - len(stream))}


def metrics(a, b):
    if a.sum() <= 0 or b.sum() <= 0:
        return {"fullCosine": None, "integratedCosine": None, "totalVariation": None}
    return {"fullCosine": SOURCE.cosine(a, b),
            "integratedCosine": SOURCE.cosine(a.sum(axis=0), b.sum(axis=0)),
            "totalVariation": float(np.abs(a / a.sum() - b / b.sum()).sum() / 2)}


def distribution(values):
    return SOURCE.stats(values)


def self_check():
    ERB.self_check()
    stream = np.zeros((8192, 2))
    anchor, length = 2048, 4800
    zeros, _, _ = covered(stream, anchor, length)
    assert not np.any(zeros) and metrics(zeros, zeros)["fullCosine"] is None
    stream[anchor] = 1
    legacy = ERB.erb_aggregate(ERB.stft_power(stream[anchor:anchor + length]))[0].mean(axis=2)
    padded, starts, _ = covered(stream, anchor, length)
    assert legacy.sum() == 0 and padded.sum() > 0
    assert np.array_equal(legacy, padded[3:3 + len(legacy)])
    assert metrics(padded, 4 * padded)["fullCosine"] > 1 - 1e-14
    assert metrics(padded, 4 * padded)["totalVariation"] == 0
    # Squared-Hann overlap is almost constant for symmetric (not periodic) Hann.
    w = np.hanning(N)
    phase_coverage = np.array([np.sum(w[phase::HOP] ** 2) for phase in range(HOP)])
    relative_span = float(np.ptp(phase_coverage) / phase_coverage.mean())
    assert relative_span < 1e-4
    stream = np.column_stack((np.sin(np.arange(8192) * .137), np.cos(np.arange(8192) * .093)))
    crop, starts, _ = covered(stream, anchor, length)
    context, _, _ = covered(stream, anchor, length, True)
    interior = (starts >= 0) & (starts + N <= length)
    assert np.array_equal(crop[interior], context[interior])
    direct = ERB.erb_aggregate(ERB.stft_power(stream[anchor - 768:anchor + int(starts[-1]) + N]))[0].mean(axis=2)
    assert np.array_equal(direct, context)
    identical = metrics(context, context)
    assert identical["fullCosine"] > 1 - 1e-14 and identical["totalVariation"] == 0
    return {"passed": True, "onsetImpulseLegacyBandPower": float(legacy.sum()),
            "onsetImpulseCoveredBandPower": float(padded.sum()),
            "squaredHannCoverageRelativeSpanAcrossAll256HopPhases": relative_span,
            "silenceAndGainIdentity": True, "exactLegacyAndInteriorReuse": True,
            "fullContextDirectExtraction": True}


def plot(rows):
    image = Image.new("RGB", (1320, 850), "white")
    draw = ImageDraw.Draw(image)
    draw.text((30, 20), "Frozen Base/Born: ERB crop-boundary sensitivity (no new audio)", fill="black")
    draw.text((30, 42), "Common 0..1 axes; dots = individual dependent event windows; horizontal line = median", fill="black")
    colors = ("#555555", "#2674aa", "#d37927")
    for row_index, metric in enumerate(("fullCosine", "integratedCosine", "totalVariation")):
        for col, duration in enumerate((100, 250, 500)):
            x, y, width, height = 65 + col * 430, 105 + row_index * 245, 365, 175
            draw.text((x, y - 27), f"{duration} ms / {metric}", fill="black")
            for tick in (0, .25, .5, .75, 1):
                yy = y + height * (1 - tick)
                draw.line((x, yy, x + width, yy), fill="#dddddd")
                draw.text((x - 30, yy - 5), str(tick), fill="black")
            selected = [r for r in rows if r["durationMs"] == duration]
            for p, policy in enumerate(POLICIES):
                cx = x + (p + .5) * width / 3
                values = [r["policies"][policy][metric] for r in selected]
                for i, value in enumerate(values):
                    xx = cx + (i % 9 - 4) * 2
                    yy = y + height * (1 - value)
                    draw.ellipse((xx - 2, yy - 2, xx + 2, yy + 2), fill=colors[p])
                yy = y + height * (1 - float(np.median(values)))
                draw.line((cx - 22, yy, cx + 22, yy), fill=colors[p], width=3)
                draw.text((cx - 51, y + height + 10), policy, fill=colors[p])
    draw.text((30, 825), "Covered-context includes real neighboring events/tails. No audibility or intrinsic-character conclusion.", fill="black")
    image.save(OUT / "boundary-sensitivity.png")


def run():
    checks = self_check()
    report, frozen, base, born, *_ = SOURCE.load_sources()
    groups, accepted = SOURCE.validate_mapping(report, frozen)
    SOURCE.ALL_GROUPS = groups
    prior = json.loads(PRIOR.read_text(encoding="utf-8"))
    # The prior event table is located explicitly, not inferred from generated output.
    prior_events = prior["eventDetails"]
    old_by_id = {e["contactIndex"]: e for e in prior_events}
    inputs = [SOURCE.BASE_WAV, SOURCE.BORN_WAV, SOURCE.SOURCE_GZIP, SOURCE.SOURCE_REPORT, PRIOR]
    before = [receipt(p) for p in inputs]
    rows, max_parity = [], 0.0
    for group in groups:
        event, existing = SOURCE.analyze_pair(group, accepted, base, born, ERB)
        for duration, old in existing.items():
            length, anchor = duration * 48, group["requestedFrame"]
            legacy_a, legacy_b = old["baseBands"], old["bornBands"]
            legacy_metrics = metrics(legacy_a, legacy_b)
            old_shape = old_by_id[group["contactIndex"]]["windows"][str(duration)]["shapeOnly"]
            assert event["windows"][str(duration)]["fixedGain"] == old_by_id[group["contactIndex"]]["windows"][str(duration)]["fixedGain"]
            for new_key, old_key in (("fullCosine", "fullTimeFrequencyCosine"),
                                     ("integratedCosine", "integratedErbProfileCosine"),
                                     ("totalVariation", "shapeTotalVariation")):
                error = abs(legacy_metrics[new_key] - old_shape[old_key])
                max_parity = max(max_parity, error)
                assert error < 1e-12, (group["contactIndex"], duration, error)
            policies, edges, supports = {"legacy": legacy_metrics}, {}, {}
            for context in (False, True):
                policy = POLICIES[2 if context else 1]
                a, starts, outside = covered(base, anchor, length, context)
                b, _, _ = covered(born, anchor, length, context)
                policies[policy] = metrics(a, b)
                supports[policy] = outside
                assert np.isfinite(a).all() and np.isfinite(b).all()
                interior = (starts >= 0) & (starts + N <= length)
                for label, legacy, expanded in (("base", legacy_a, a), ("born", legacy_b, b)):
                    if not context:
                        assert np.array_equal(legacy, expanded[3:3 + len(legacy)])
                        total = float(expanded.sum())
                        edges[label] = {"leadingOmittedFraction": float(expanded[starts < 0].sum() / total),
                                        "trailingOmittedFraction": float(expanded[3 + len(legacy):].sum() / total),
                                        "legacyCoveredBandPowerRatio": float(legacy.sum() / total)}
                    else:
                        assert np.array_equal(legacy[:int(interior.sum())], expanded[interior])
            rows.append({"contactIndex": group["contactIndex"], "durationMs": duration,
                         "requestedFrame": anchor, "dispatchOffsetFrames": group["actualFrame"] - anchor,
                         "otherGroups": event["windows"][str(duration)]["otherParentGroupsStartingInWindow"],
                         "nativeFixedGain": event["windows"][str(duration)]["fixedGain"],
                         "policies": policies, "omittedBandPower": edges, "recordingEdgePadding": supports,
                         "legacyFrames": len(legacy_a), "coveredFrames": len(starts),
                         "coveredFrameStartRangeSamples": [int(starts[0]), int(starts[-1])]})
    summary = {}
    for duration in (100, 250, 500):
        selected = [r for r in rows if r["durationMs"] == duration]
        summary[str(duration)] = {"windows": len(selected), "policies": {}, "pairedDeltas": {}, "omittedBandPower": {}}
        item = summary[str(duration)]
        for policy in POLICIES:
            item["policies"][policy] = {m: distribution([r["policies"][policy][m] for r in selected])
                                        for m in legacy_metrics}
        for first, second in (("legacy", "covered-crop"), ("covered-crop", "covered-context")):
            item["pairedDeltas"][second + "Minus" + first] = {
                m: distribution([r["policies"][second][m] - r["policies"][first][m] for r in selected])
                for m in legacy_metrics}
        for label in ("base", "born"):
            item["omittedBandPower"][label] = {k: distribution([r["omittedBandPower"][label][k] for r in selected])
                                               for k in edges[label]}
    assert [summary[str(ms)]["windows"] for ms in (100, 250, 500)] == [43, 43, 42]
    assert before == [receipt(p) for p in inputs]
    result = {"schemaVersion": 1, "baseline": BASELINE, "protocol": receipt(OUT / "protocol.md"),
              "sources": before, "tools": [receipt(Path(__file__)), receipt(SOURCE.HELPER_PATH),
                                             receipt(ROOT / "scripts/ant-base-born-natural-event-erb.py")],
              "environment": {"python": platform.python_version(), "numpy": np.__version__, "pillow": Image.__version__},
              "method": {"policies": list(POLICIES), "fft": N, "hop": HOP, "sampleRate": ERB.RATE,
                         "frameCenters": "frame start + 511.5 samples; covered centers may lie outside crop",
                         "metricScale": "linear one-sided ERB power, mean L/R; cosine and unit-sum TV; not loudness",
                         "contextIsIsolatedEvent": False, "audioShifted": False},
              "validation": {"selfChecks": checks, "priorMetricMaxAbsoluteError": max_parity,
                             "originalInputReceiptsUnchanged": True, "allLegacyFramesExact": True,
                             "allInteriorFramesExact": True}, "summary": summary, "events": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "analysis.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    plot(rows)
    manifest = {"artifacts": [receipt(OUT / name) for name in ("analysis.json", "boundary-sensitivity.png")],
                "selfHash": "omitted", "productionChange": False, "newAudioRender": False}
    (OUT / "report-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"checks": checks, "priorMetricMaxAbsoluteError": max_parity,
                      "medianFullCosine": {ms: {p: s["policies"][p]["fullCosine"]["median"] for p in POLICIES}
                                           for ms, s in summary.items()}}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        print(json.dumps(self_check(), indent=2))
    else:
        run()
