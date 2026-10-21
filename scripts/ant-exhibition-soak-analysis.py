#!/usr/bin/env python3
"""Summarize ant-exhibition-soak-v1 telemetry without changing source evidence."""

import argparse
import csv
import hashlib
import json
import math
import statistics
import sys
from pathlib import Path


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def pct(values, p):
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * p / 100
    lo = int(index)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)


def metric_values(record):
    app = record["app"]
    return app.get("bridgeDiagnostics") or {}


def parse_run(run_dir):
    run_dir = Path(run_dir).resolve()
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    if run.get("schema") != "ant-exhibition-soak-v1":
        raise ValueError(f"Unsupported run schema: {run.get('schema')!r}")
    records = [json.loads(line) for line in (run_dir / "telemetry.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    starts = [r for r in records if r.get("type") == "start"]
    if not starts:
        raise ValueError("telemetry.jsonl has no start record")
    start = starts[0]
    measured = start.get("measuredStart") or {}
    if not finite(measured.get("perfMs")) or not finite(measured.get("simulationTimeMs")):
        raise ValueError("start record lacks measuredStart perfMs/simulationTimeMs")
    samples = []
    for record in records:
        if record.get("type") != "sample":
            continue
        app = record.get("app") or {}
        if not finite(app.get("perfMs")):
            continue
        elapsed = (app["perfMs"] - measured["perfMs"]) / 1000
        sim_elapsed = (app.get("simulationTimeMs", measured["simulationTimeMs"]) - measured["simulationTimeMs"]) / 1000
        audio_start = measured.get("audioTime")
        audio_elapsed = app.get("audioTime") - audio_start if finite(app.get("audioTime")) and finite(audio_start) else None
        previous = samples[-1] if samples else None
        wall_delta = elapsed - previous["elapsedSeconds"] if previous else None
        sim_delta = sim_elapsed - previous["simulationElapsedSeconds"] if previous else None
        audio_delta = audio_elapsed - previous["audioElapsedSeconds"] if previous and audio_elapsed is not None and previous["audioElapsedSeconds"] is not None else None
        interval = app.get("interval") or {}
        raw_raf = interval.get("rafCount")
        intervals = [x for x in interval.get("frameIntervalsMs", []) if finite(x)]
        callback_count = raw_raf if finite(raw_raf) else None
        app["audioElapsedSeconds"] = audio_elapsed
        app["simulationElapsedSeconds"] = sim_elapsed
        bridge = metric_values(record)
        prior_bridge = previous.get("_bridge", {}) if previous else {}
        route_names = ("routedFootEvents", "routedFeet", "strikeRoutes", "directExposedStrikes", "supportedFeet",
                       "unsupportedFeet", "unroutedContacts", "omittedResidentRouteFeet", "dropped", "births")
        route_delta = {name: bridge.get(name) - prior_bridge.get(name) if previous and finite(bridge.get(name)) and finite(prior_bridge.get(name)) else None
                       for name in route_names}
        row = {"elapsedSeconds": elapsed, "recordedAt": record.get("recordedAt"),
               "requestedElapsedSeconds": record.get("requestedElapsedSeconds"), "wallDeltaSeconds": wall_delta,
               "simulationElapsedSeconds": sim_elapsed, "simulationLagSeconds": elapsed - sim_elapsed,
               "simulationDeltaSeconds": sim_delta, "simulationPerWall": sim_delta / wall_delta if finite(sim_delta) and finite(wall_delta) and wall_delta else None,
               "audioElapsedSeconds": audio_elapsed, "audioLagSeconds": elapsed - audio_elapsed if audio_elapsed is not None else None,
               "audioDeltaSeconds": audio_delta, "audioPerWall": audio_delta / wall_delta if finite(audio_delta) and finite(wall_delta) and wall_delta else None,
               "rafCounter": raw_raf, "rafCallbackEstimate": callback_count,
               "rafHz": callback_count / wall_delta if finite(callback_count) and finite(wall_delta) and wall_delta else None,
               "frameIntervalCount": len(intervals), "frameIntervalMedianMs": statistics.median(intervals) if intervals else None,
               "frameIntervalP95Ms": pct(intervals, 95), "frameIntervalP99Ms": pct(intervals, 99),
               "frameIntervalMaxMs": max(intervals) if intervals else None,
               "simulationTimeMs": app.get("simulationTimeMs"), "audioTime": app.get("audioTime"),
               "plates": app.get("plates"), "worldNodules": app.get("nodules"), "population": app.get("population"),
               "historyMaskCells": app.get("historyMaskCells"), "zCouplingEnabled": app.get("zCouplingEnabled"),
               "zLinks": app.get("zLinks"), "historyNodes": app.get("historyNodes"),
               "residentPlateCount": (app.get("residency") or {}).get("residentPlateCount"),
               "plateHistoryCount": (app.get("residency") or {}).get("plateHistoryCount"),
               "retiredPlateCount": (app.get("residency") or {}).get("retiredPlateCount"),
               "residentNodeCount": (app.get("residency") or {}).get("residentNodeCount"),
               "residentNoduleCount": (app.get("residency") or {}).get("residentNoduleCount"),
               "residentNoduleDofCount": (app.get("residency") or {}).get("residentNoduleDofCount"),
               "topologyCompileCount": (app.get("residency") or {}).get("topologyCompileCount"),
               "topologyCompileWallMs": (app.get("residency") or {}).get("topologyCompileWallMs"),
               "topologyCompileWallMsMax": (app.get("residency") or {}).get("topologyCompileWallMsMax"),
               "activeNodes": app.get("activeNodes"), "awakeLayers": app.get("awakeLayers"),
               "sleepingLayers": app.get("sleepingLayers"), "deepPlateCouplingTransfers": app.get("deepPlateCouplingTransfers"),
               "jsHeapUsedBytes": (record.get("jsHeap") or {}).get("usedSize"),
               "jsHeapTotalBytes": (record.get("jsHeap") or {}).get("totalSize"),
               "domNodes": (record.get("domCounters") or {}).get("nodes"),
               "domDocuments": (record.get("domCounters") or {}).get("documents"),
               "jsEventListeners": (record.get("domCounters") or {}).get("jsEventListeners"),
               "pcmRms": (app.get("pcmObservation") or {}).get("rms"), "pcmPeak": (app.get("pcmObservation") or {}).get("peak"),
               "pcmNonFinite": (app.get("pcmObservation") or {}).get("nonFinite"),
               "pcmAtOrAboveUnity": (app.get("pcmObservation") or {}).get("atOrAboveUnity"),
               "processorNonFinite": app.get("nonFinite"), "processorClipped": app.get("clipped"),
               "processorErrorsTotal": app.get("processorErrorsTotal"), "audioState": app.get("audioState"),
               "audioEnabled": app.get("audioEnabled"), "visibilityState": app.get("visibilityState"), "hasFocus": app.get("hasFocus"),
               "pageErrors": record.get("pageErrors"), "routeDelta": route_delta, "_bridge": bridge, "_processes": record.get("processes") or []}
        samples.append(row)
    telemetry_lines = (run_dir / "telemetry.jsonl").read_text(encoding="utf-8").splitlines()
    end_line = next((line for line in reversed(telemetry_lines) if line.strip() and json.loads(line).get("type") == "end"), None)
    input_hashes = {}
    for name in ("run.json", "telemetry.jsonl"):
        raw = (run_dir / name).read_bytes()
        input_hashes[name] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    end_raw = end_line.encode("utf-8") if end_line else None
    input_hashes["endRecordLine"] = {"bytes": len(end_raw) if end_raw else None,
                                      "sha256": hashlib.sha256(end_raw).hexdigest() if end_raw else None}
    return run_dir, run, records, start, samples, input_hashes


def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def summarize(run_dir, run, records, start, samples):
    config = run.get("config", {})
    heartbeat_path = run_dir / "heartbeat.json"
    heartbeat = json.loads(heartbeat_path.read_text(encoding="utf-8")) if heartbeat_path.exists() else None
    end_records = [r for r in records if r.get("type") == "end"]
    end = end_records[-1] if end_records else None
    actual = end.get("elapsedSeconds") if end else (heartbeat or {}).get("elapsedSeconds")
    last_sample = samples[-1]["elapsedSeconds"] if samples else None
    checkpoint_records = [r for r in records if r.get("type") == "world-checkpoint"]
    initial = start.get("initial") or {}
    first_bridge = samples[0].get("_bridge", {}) if samples else {}
    final = samples[-1] if samples else {}
    measured_route_delta = {}
    if len(samples) > 1:
        for name, value in samples[-1].get("routeDelta", {}).items():
            measured_route_delta[name] = sum((s.get("routeDelta", {}).get(name) or 0) for s in samples[1:])
    process_rows = []
    for i, sample in enumerate(samples):
        prev = samples[i - 1] if i else None
        if not prev or not finite(sample.get("wallDeltaSeconds")) or not sample["wallDeltaSeconds"]:
            continue
        before = {(p.get("type"), p.get("id")): p for p in prev["_processes"]}
        for proc in sample["_processes"]:
            key = (proc.get("type"), proc.get("id"))
            old = before.get(key)
            if old and finite(proc.get("cpuTime")) and finite(old.get("cpuTime")):
                delta = proc["cpuTime"] - old["cpuTime"]
                process_rows.append({"elapsedSeconds": sample["elapsedSeconds"], "type": key[0], "id": key[1],
                                     "cpuDeltaSeconds": delta, "cpuPercentOneCore": 100 * delta / sample["wallDeltaSeconds"]})
    checkpoint_bytes = {"count": len(checkpoint_records),
                        "compressedBytes": sum(r.get("compressedBytes", 0) for r in checkpoint_records),
                        "uncompressedBytes": sum(r.get("uncompressedBytes", 0) for r in checkpoint_records),
                        "files": [{k: r.get(k) for k in ("checkpointSeconds", "file", "compressedBytes", "uncompressedBytes", "sha256")} for r in checkpoint_records]}
    return {"schema": "ant-exhibition-soak-analysis-v1", "inputRunDirectory": str(run_dir),
            "sourceRunSchema": run.get("schema"), "runId": config.get("runId"), "head": config.get("head"),
            "status": end.get("status") if end else (heartbeat or {}).get("status", "incomplete"),
            "stopReason": end.get("stopReason") if end else (heartbeat or {}).get("stopReason"),
            "timing": {"requestedMeasuredSeconds": config.get("measuredSecondsRequested"), "measuredStartWallTime": (start.get("measuredStart") or {}).get("wallTime"),
                       "endElapsedSeconds": actual, "lastSampleElapsedSeconds": last_sample,
                       "endMinusLastSampleSeconds": actual - last_sample if finite(actual) and finite(last_sample) else None,
                       "heartbeatUpdatedAt": (heartbeat or {}).get("updatedAt"), "heartbeatElapsedSeconds": (heartbeat or {}).get("elapsedSeconds"),
                       "sampleCount": len(samples), "firstSampleElapsedSeconds": samples[0]["elapsedSeconds"] if samples else None,
                       "sampleIntervalSecondsMedian": statistics.median([s["wallDeltaSeconds"] for s in samples[1:] if finite(s.get("wallDeltaSeconds"))]) if len(samples) > 1 else None},
            "lastSampleClockOffsets": {k: final.get(k) for k in ("elapsedSeconds", "simulationElapsedSeconds", "simulationLagSeconds",
                                         "audioElapsedSeconds", "audioLagSeconds", "simulationPerWall", "audioPerWall", "rafHz")},
            "preroll": {"mode": config.get("preGrow"), "ticks": initial.get("prerollTicks"), "wallMs": initial.get("prerollWallMs"),
                        "simulationTimeMsAtMeasuredStart": (start.get("measuredStart") or {}).get("simulationTimeMs"),
                        "platesAtMeasuredStart": (start.get("start") or {}).get("plates"), "worldNodulesAtMeasuredStart": (start.get("start") or {}).get("nodules"),
                        "footCountersAtFirstSampleIncludePreroll": True},
            "conditions": {"headed": config.get("headed"), "scheduling": config.get("scheduling"),
                           "backgroundThrottleFlags": config.get("backgroundThrottleFlags"), "launchArgs": config.get("launchArgs"),
                           "soakHarnessSource": (config.get("sourceProvenance") or {}).get("scripts/ant-exhibition-soak.js"),
                           "audioRequested": config.get("audio"), "startupQuery": config.get("startupQuery"),
                           "historyCapacity": config.get("historyCapacity"), "historyCapacityMode": config.get("historyCapacityMode"),
                           "machine": config.get("machine")},
            "finalObserved": {k: final.get(k) for k in ("plates", "worldNodules", "population", "historyMaskCells", "historyNodes",
                          "residentPlateCount", "plateHistoryCount", "retiredPlateCount", "residentNodeCount", "residentNoduleCount",
                          "residentNoduleDofCount", "activeNodes", "awakeLayers", "sleepingLayers", "topologyCompileCount",
                          "topologyCompileWallMs", "topologyCompileWallMsMax", "processorNonFinite", "processorClipped", "processorErrorsTotal")},
            "footRoutingDelivery": {"firstSampleCumulativeTotalsIncludePrerollAndFirstMeasuredWindow": first_bridge,
                                    "measuredBetweenSampleIncrements": measured_route_delta,
                                    "baselineLimitation": "No bridge diagnostic counter snapshot is written at measured start; first sample total cannot be decomposed into preroll and its first measured interval."},
            "worldCheckpoints": checkpoint_bytes,
            "observerCostNote": "World checkpoints serialize getSnapshot() without audio and gzip it at level 6 inline; telemetry stores byte sizes and hashes but does not time serialization/compression separately. Checkpoint work can affect nearby sample cadence.",
            "measurementNotes": ["simulation/audio elapsed values are measured-start-relative; lag is monotonic wall elapsed minus that elapsed clock.",
                                 "The current v1 soak source increments rafCount once per requestAnimationFrame callback; rafHz uses that count directly.",
                                 "V1 telemetry has no stored-material-mass field; historyMaskCells is reported as a footprint measure, not mass.",
                                 "PCM is one sampled 2048-frame post-bridge-gain observation per telemetry sample, not continuous clipping coverage.",
                                 "CPU deltas use only process type+ID pairs stable across adjacent samples; percent is one logical core.",
                                 "No combined score is computed."], "processCpuDeltaRows": len(process_rows), "_processRows": process_rows}


def load_charting():
    try:
        from reportlab.graphics import renderSVG
        from reportlab.graphics.shapes import Drawing, Line, PolyLine, String
        from reportlab.lib import colors
    except ImportError as exc:
        raise RuntimeError("ReportLab SVG chart support is unavailable; use --no-plot for JSON/CSV outputs") from exc
    return Drawing, Line, PolyLine, String, colors, renderSVG


def plot_svg(path, rows, requested, capacity, charting):
    Drawing, Line, PolyLine, String, colors, renderSVG = charting
    width, height, left, right, panel_h, gap = 1100, 900, 120, 35, 145, 18
    plot_w = width - left - right
    x_max = requested if finite(requested) and requested > 0 else max((r["elapsedSeconds"] for r in rows), default=1)
    panels = [
        ("Clock lag (s)", -5, 30, [("simulation", "simulationLagSeconds", "#1f77b4"), ("audio", "audioLagSeconds", "#d62728")]),
        ("rAF callbacks (Hz)", 0, 120, [("rAF", "rafHz", "#ff7f0e")]),
        ("History / resident counts", 0, max(1024, capacity), [("history plates", "plateHistoryCount", "#1f77b4"), ("resident plates", "residentPlateCount", "#2ca02c"), ("resident nodes", "residentNodeCount", "#9467bd")]),
        ("JS heap used (MiB)", 0, 4096, [("heap", "jsHeapUsedBytes", "#2ca02c")]),
        ("Topology compile (ms)", 0, 5000, [("total", "topologyCompileWallMs", "#1f77b4"), ("max", "topologyCompileWallMsMax", "#d62728")]),
    ]
    drawing = Drawing(width, height)
    drawing.add(String(left, height - 24, "ANT exhibition soak telemetry (fixed axes)", fontSize=16, fillColor=colors.black))
    for i, (title, low, high, series) in enumerate(panels):
        bottom = 48 + (4 - i) * (panel_h + gap)
        top = bottom + panel_h - 24
        drawing.add(String(12, top + 5, title, fontSize=10, fillColor=colors.black))
        for tick in range(5):
            y = bottom + tick * (top - bottom) / 4
            value = low + tick * (high - low) / 4
            drawing.add(Line(left, y, left + plot_w, y, strokeColor=colors.HexColor("#dddddd"), strokeWidth=.5))
            drawing.add(String(left - 8, y - 3, f"{value:g}", fontSize=7, textAnchor="end", fillColor=colors.HexColor("#555555")))
        for tick in range(5):
            x = left + tick * plot_w / 4
            drawing.add(Line(x, bottom, x, top, strokeColor=colors.HexColor("#eeeeee"), strokeWidth=.5))
        drawing.add(Line(left, bottom, left, top, strokeColor=colors.black, strokeWidth=.7))
        drawing.add(Line(left, bottom, left + plot_w, bottom, strokeColor=colors.black, strokeWidth=.7))
        for j, (label, key, color) in enumerate(series):
            points = []
            for row in rows:
                value = row.get(key)
                if key == "jsHeapUsedBytes" and finite(value):
                    value /= 1024 * 1024
                if finite(value):
                    px = left + row["elapsedSeconds"] / x_max * plot_w
                    py = bottom + (value - low) / (high - low) * (top - bottom)
                    points.extend((px, py))
            if len(points) >= 4:
                drawing.add(PolyLine(points, strokeColor=colors.HexColor(color), strokeWidth=1.25))
            legend_x = left + j * 135
            drawing.add(Line(legend_x, top + 12, legend_x + 18, top + 12, strokeColor=colors.HexColor(color), strokeWidth=1.5))
            drawing.add(String(legend_x + 23, top + 9, label, fontSize=8, fillColor=colors.black))
        if i == 4:
            for tick in range(5):
                x = left + tick * plot_w / 4
                drawing.add(String(x, bottom - 14, f"{x_max * tick / 4:g}", fontSize=7, textAnchor="middle", fillColor=colors.black))
    drawing.add(String(left + plot_w / 2, 12, "Measured wall time (s); preroll excluded", fontSize=9, textAnchor="middle", fillColor=colors.black))
    renderSVG.drawToFile(drawing, str(path))


def self_check():
    measured_wall, measured_sim, measured_audio = 100.0, 5000.0, 12.0
    sample_wall, sample_sim, sample_audio = 140.0, 35_000.0, 51.5
    wall_elapsed = (sample_wall - measured_wall)
    sim_elapsed = (sample_sim - measured_sim) / 1000
    audio_elapsed = sample_audio - measured_audio
    assert wall_elapsed == 40
    assert sim_elapsed == 30
    assert audio_elapsed == 39.5
    assert wall_elapsed - sim_elapsed == 10
    assert wall_elapsed - audio_elapsed == .5
    assert pct([1, 2, 3, 4, 5], 95) == 4.8
    frame = {"rafCount": 1800, "updateCount": 1800, "frameIntervalsMs": [16.7] * 1799}
    assert frame["rafCount"] / 30 == 60
    assert frame["rafCount"] == frame["updateCount"]
    assert len(frame["frameIntervalsMs"]) == frame["rafCount"] - 1
    print("ant-exhibition-soak-analysis self-check passed (measured-start-relative simulation/audio offsets)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", nargs="?", help="completed or partial soak run directory")
    parser.add_argument("--output", help="new output directory; default is RUN_DIR/analysis")
    parser.add_argument("--self-check", action="store_true", help="run synthetic clock-offset assertions")
    parser.add_argument("--no-plot", action="store_true", help="write JSON/CSV outputs without a chart")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.run_dir:
        parser.error("run_dir is required unless --self-check is used")
    charting = None if args.no_plot else load_charting()
    run_dir, run, records, start, rows, input_hashes = parse_run(args.run_dir)
    out = Path(args.output).resolve() if args.output else run_dir / "analysis"
    if out.exists():
        raise FileExistsError(f"refusing to overwrite existing output directory: {out}")
    out.mkdir(parents=True)
    summary = summarize(run_dir, run, records, start, rows)
    process_rows = summary.pop("_processRows")
    summary["inputHashes"] = input_hashes
    (out / "summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    flat_rows = [{k: v for k, v in row.items() if not k.startswith("_") and k != "routeDelta"} | {f"routeDelta_{k}": v for k, v in row["routeDelta"].items()} for row in rows]
    fields = list(dict.fromkeys(k for row in flat_rows for k in row))
    write_csv(out / "samples.csv", flat_rows, fields)
    write_csv(out / "process-cpu-deltas.csv", process_rows, ("elapsedSeconds", "type", "id", "cpuDeltaSeconds", "cpuPercentOneCore"))
    receipt = {"schema": "ant-exhibition-soak-analysis-receipt-v1", "runId": summary["runId"],
               "status": summary["status"], "inputs": input_hashes,
               "outputs": ["summary.json", "samples.csv", "process-cpu-deltas.csv"] + ([] if args.no_plot else ["soak-summary.svg"]),
               "plot": "omitted by --no-plot" if args.no_plot else "generated"}
    (out / "analysis-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    if not args.no_plot:
        plot_svg(out / "soak-summary.svg", rows, run.get("config", {}).get("measuredSecondsRequested"), run.get("config", {}).get("historyCapacity", 256), charting)
    print(f"Wrote {out}")
    print(f"Status: {summary['status']}; measured samples: {len(rows)}; end={summary['timing']['endElapsedSeconds']} s; last sample={summary['timing']['lastSampleElapsedSeconds']} s")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
