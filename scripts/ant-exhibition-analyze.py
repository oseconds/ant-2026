#!/usr/bin/env python3
"""Describe paired exhibition benchmark PCM without attributing mixed sources."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

import numpy as np
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    plt = None
try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = ImageDraw = None


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/ant/evidence/2026-10-21-exhibition-audio-runtime"
RATE = 48_000
CHANNELS = 2
PRECONDITION_S = 2
VARIANT_ORDER = ("full", "fast-wake", "dense-lap", "z-off", "plate-gate", "cell-gate")
BANDS = ((0, 125), (125, 250), (250, 500), (500, 1000), (1000, 2000),
         (2000, 4000), (4000, 8000), (8000, 12000), (12000, 24000))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_float_wav(path, frames):
    raw = path.read_bytes()
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"{path}: expected RIFF/WAVE")
    offset, fmt, pcm = 12, None, None
    while offset + 8 <= len(raw):
        name, size = struct.unpack_from("<4sI", raw, offset)
        start, end = offset + 8, offset + 8 + size
        if end > len(raw):
            raise ValueError(f"{path}: truncated {name!r} chunk")
        if name == b"fmt ":
            fmt = struct.unpack_from("<HHIIHH", raw, start)
        elif name == b"data":
            pcm = raw[start:end]
        offset = end + (size & 1)
    if fmt is None or pcm is None:
        raise ValueError(f"{path}: missing fmt or data chunk")
    encoding, channels, rate, _, block_align, bits = fmt
    if (encoding, channels, rate, block_align, bits) != (3, CHANNELS, RATE, 8, 32):
        raise ValueError(f"{path}: expected stereo 48 kHz Float32 WAV, got fmt={fmt}")
    samples = np.frombuffer(pcm, dtype="<f4")
    if samples.size != frames * CHANNELS:
        raise ValueError(f"{path}: expected {frames * CHANNELS} samples, got {samples.size}")
    if not np.isfinite(samples).all():
        raise ValueError(f"{path}: non-finite samples")
    return (samples.reshape(frames, CHANNELS).astype(np.float64), sha256(raw),
            sha256(pcm), len(raw))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x), dtype=np.float64)))


def dbfs(value):
    return float(20 * math.log10(value)) if value > 0 else None


def windows(signal, ms):
    width = round(RATE * ms / 1000)
    frames = len(signal) // width
    trimmed = signal[:frames * width].reshape(frames, width, CHANNELS)
    curve = np.sqrt(np.mean(np.square(trimmed), axis=(1, 2), dtype=np.float64))
    return curve


def stft(signal, fs, window, nperseg, noverlap, boundary, padded, axis=0):
    if axis != 0 or boundary is not None or padded or window != "hann":
        raise ValueError("unsupported STFT configuration")
    hop = nperseg - noverlap
    starts = np.arange(0, max(1, len(signal) - nperseg + 1), hop)
    frames = np.stack([signal[start:start + nperseg] for start in starts])
    taper = np.hanning(nperseg)
    z = np.fft.rfft(frames * taper[None, :, None], axis=1) / taper.sum()
    return np.fft.rfftfreq(nperseg, 1 / fs), (starts + nperseg / 2) / fs, z.transpose(1, 0, 2)


def spectrum(signal):
    # Fixed STFT settings and unscaled source PCM; no per-file normalization.
    frequencies, times, z = stft(signal, fs=RATE, window="hann", nperseg=4096,
                                 noverlap=3072, boundary=None, padded=False, axis=0)
    power = np.mean(np.abs(z) ** 2, axis=2)
    return frequencies, times, power


def metrics(reference, candidate):
    # Analyze the requested ten-second measured region only; retain two seconds as setup.
    start = PRECONDITION_S * RATE
    a, b = reference[start:], candidate[start:]
    diff = b - a
    corr = [float(np.corrcoef(a[:, ch], b[:, ch])[0, 1]) if np.std(a[:, ch]) and np.std(b[:, ch]) else None
            for ch in range(CHANNELS)]
    fa, ta, pa = spectrum(a)
    fb, tb, pb = spectrum(b)
    if not np.array_equal(fa, fb) or not np.array_equal(ta, tb):
        raise ValueError("paired STFT grids differ")
    delta = pb - pa
    band_deltas = []
    for low, high in BANDS:
        mask = (fa >= low) & (fa < high)
        ap = float(pa[mask].sum(axis=0).mean()) if mask.any() else 0.0
        bp = float(pb[mask].sum(axis=0).mean()) if mask.any() else 0.0
        band_deltas.append({"hz": [low, high], "fullPower": ap, "variantPower": bp,
                            "deltaPowerDb": 10 * math.log10(bp / ap) if ap and bp else None})
    return {
        "full": {"rms": rms(a), "rmsDbfs": dbfs(rms(a)), "peak": float(np.max(np.abs(a))),
                 "channelRms": [rms(a[:, i]) for i in range(CHANNELS)]},
        "variant": {"rms": rms(b), "rmsDbfs": dbfs(rms(b)), "peak": float(np.max(np.abs(b))),
                    "channelRms": [rms(b[:, i]) for i in range(CHANNELS)]},
        "difference": {"rms": rms(diff), "rmsDbfs": dbfs(rms(diff)),
                       "peak": float(np.max(np.abs(diff))),
                       "energyRatioToFull": float(np.sum(diff * diff) / np.sum(a * a)) if np.any(a) else None},
        "correlationByChannel": corr,
        "envelopes": {f"{ms}ms": {"windowCount": len(windows(a, ms)),
                    "fullRms": windows(a, ms).tolist(), "variantRms": windows(b, ms).tolist(),
                    "deltaDb": [20 * math.log10(y / x) if x and y else None
                               for x, y in zip(windows(a, ms), windows(b, ms))]}
                     for ms in (100, 250, 500)},
        "frequency": {"stft": {"windowSamples": 4096, "hopSamples": 1024, "window": "hann",
                                 "frames": int(len(ta)), "frequencyLimitHz": RATE / 2},
                      "bandDeltaPowerDb": band_deltas,
                      "meanAbsoluteSpectralDeltaPower": float(np.mean(np.abs(delta)))},
    }


def make_plot(audio, counts, variants, duration):
    if plt is None:
        return make_pillow_plots(audio, counts, variants, duration) if Image is not None else False
    # Fixed global axes: waveform [-1,1], spectrogram [-120,0] dBFS, 0-12 kHz.
    fig, axes = plt.subplots(len(variants), len(counts), figsize=(15, max(4, 2.5 * len(variants))), sharex=True, sharey=True, squeeze=False)
    for row, variant in enumerate(variants):
        for col, count in enumerate(counts):
            ax = axes[row, col]
            if (count, variant) not in audio:
                ax.set_visible(False)
                continue
            x = audio[(count, variant)][0][PRECONDITION_S * RATE:]
            # A fixed max envelope gives legible waveform detail while preserving the fixed amplitude axis.
            stride = 240
            trunc = x[:(len(x) // stride) * stride].reshape(-1, stride, 2)
            t = (np.arange(len(trunc)) * stride + stride / 2) / RATE
            low = trunc.min(axis=(1, 2)); high = trunc.max(axis=(1, 2))
            ax.fill_between(t, low, high, color="#3a6f9b", alpha=.65, linewidth=0)
            ax.set_ylim(-1, 1); ax.set_xlim(0, duration)
            ax.grid(alpha=.2)
            if row == 0: ax.set_title(f"{count} plates")
            if col == 0: ax.set_ylabel(f"{variant}\nAmplitude")
    fig.suptitle("Exhibition benchmark PCM — fixed amplitude scale; two-second setup excluded", y=.995)
    fig.supxlabel("Seconds after precondition")
    fig.tight_layout(rect=(0, 0, 1, .985))
    fig.savefig(EVIDENCE / "acoustic-waveform.png", dpi=140)
    plt.close(fig)

    fig, axes = plt.subplots(len(variants), len(counts), figsize=(15, max(4, 2.5 * len(variants))), sharex=True, sharey=True, squeeze=False)
    for row, variant in enumerate(variants):
        for col, count in enumerate(counts):
            if (count, variant) not in audio:
                axes[row, col].set_visible(False)
                continue
            x = audio[(count, variant)][0][PRECONDITION_S * RATE:]
            freqs, times, z = stft(x, fs=RATE, window="hann", nperseg=2048, noverlap=1536,
                                   boundary=None, padded=False, axis=0)
            power = np.mean(np.abs(z) ** 2, axis=2)
            levels = 10 * np.log10(np.maximum(power, 1e-12))
            ax = axes[row, col]
            mesh = ax.pcolormesh(times, freqs, levels, shading="auto", cmap="magma", vmin=-120, vmax=0)
            ax.set_ylim(0, 12000); ax.set_xlim(0, duration)
            if row == 0: ax.set_title(f"{count} plates")
            if col == 0: ax.set_ylabel(f"{variant}\nHz")
    fig.suptitle("Exhibition benchmark spectrograms — fixed −120 to 0 dBFS scale, 0–12 kHz", y=.995)
    fig.supxlabel("Seconds after precondition")
    fig.colorbar(mesh, ax=axes.ravel().tolist(), label="Power (dBFS)", shrink=.7)
    fig.savefig(EVIDENCE / "acoustic-spectrogram.png", dpi=140)
    plt.close(fig)
    return True


def make_pillow_plots(audio, counts, variants, duration):
    panel_w, panel_h, margin, top = 380, 230, 24, 34
    width, height = margin + len(counts) * panel_w, top + len(variants) * panel_h + 18
    waveform = Image.new("RGB", (width, height), "white")
    spec = Image.new("RGB", (width, height), "white")
    wave_draw, spec_draw = ImageDraw.Draw(waveform), ImageDraw.Draw(spec)
    stops = ((0.0, (0, 0, 0)), (.25, (50, 10, 95)), (.5, (180, 30, 50)),
             (.75, (245, 110, 20)), (1.0, (255, 240, 120)))
    spec_palette = np.asarray([[np.interp(t, [x[0] for x in stops], [x[1][channel] for x in stops])
                                for channel in range(3)] for t in np.linspace(0, 1, 256)], dtype=np.uint8)

    for col, count in enumerate(counts):
        x0 = margin + col * panel_w
        wave_draw.text((x0, 8), f"{count} plates", fill="black")
        spec_draw.text((x0, 8), f"{count} plates", fill="black")
    for row, variant in enumerate(variants):
        for col, count in enumerate(counts):
            if (count, variant) not in audio:
                continue
            x = audio[(count, variant)][0][PRECONDITION_S * RATE:]
            px = margin + col * panel_w + 40
            py = top + row * panel_h + 20
            pw, ph = panel_w - 52, panel_h - 52
            wave_draw.text((margin + col * panel_w, top + row * panel_h), variant, fill="black")
            wave_draw.rectangle((px, py, px + pw, py + ph), outline="#555555")
            wave_draw.line((px, py + ph // 2, px + pw, py + ph // 2), fill="#aaaaaa")
            wave_draw.text((px - 34, py - 4), "+1", fill="black")
            wave_draw.text((px - 28, py + ph // 2 - 5), "0", fill="black")
            wave_draw.text((px - 34, py + ph - 10), "-1", fill="black")
            wave_draw.text((px, py + ph + 3), "0", fill="black")
            wave_draw.text((px + pw - 28, py + ph + 3), f"{duration:g}s", fill="black")
            stride = max(1, math.ceil(duration * RATE / pw))
            for i in range(pw):
                start = i * stride
                if start >= len(x):
                    break
                segment = x[start:min(start + stride, len(x))]
                lo, hi = float(segment.min()), float(segment.max())
                y1 = py + int((1 - min(1, max(-1, hi))) * ph / 2)
                y2 = py + int((1 - min(1, max(-1, lo))) * ph / 2)
                wave_draw.line((px + i, y1, px + i, y2), fill="#336f9e")
            spec_draw.text((margin + col * panel_w, top + row * panel_h), variant, fill="black")
            spec_draw.rectangle((px, py, px + pw, py + ph), outline="#555555")
            spec_draw.text((px - 31, py - 4), "12k", fill="black")
            spec_draw.text((px - 11, py + ph - 10), "0", fill="black")
            spec_draw.text((px, py + ph + 3), "0", fill="black")
            spec_draw.text((px + pw - 28, py + ph + 3), f"{duration:g}s", fill="black")
            freqs, times, z = stft(x, fs=RATE, window="hann", nperseg=2048, noverlap=1536,
                                   boundary=None, padded=False, axis=0)
            power = np.mean(np.abs(z) ** 2, axis=2)
            db = np.clip(10 * np.log10(np.maximum(power, 1e-12)), -120, 0)
            target_times = np.linspace(0, duration, pw, endpoint=False)
            time_idx = np.minimum(len(times) - 1, np.searchsorted(times, target_times, side="left"))
            visible = target_times <= times[-1]
            freq_idx = np.minimum(len(freqs) - 1, np.floor(np.linspace(0, 12000, ph, endpoint=False) * len(freqs) / (RATE / 2)).astype(int))
            scaled = np.clip(np.rint((db[np.ix_(freq_idx, time_idx)] + 120) * (255 / 120)), 0, 255).astype(np.uint8)
            rgb = spec_palette[scaled[::-1, :]]
            rgb[:, ~visible] = 255
            panel = Image.fromarray(rgb, "RGB")
            spec.paste(panel, (px, py))
    ImageDraw.Draw(waveform).text((margin, height - 17), "Time after 2 s precondition (s); amplitude fixed at -1 to +1", fill="black")
    ImageDraw.Draw(spec).text((margin, height - 17), "Time after 2 s precondition (s); power fixed at -120 to 0 dBFS; frequency 0-12 kHz", fill="black")
    waveform.save(EVIDENCE / "acoustic-waveform.png")
    spec.save(EVIDENCE / "acoustic-spectrogram.png")
    return True


def summarize_pickup_stems(stems):
    targets = ("full", "z-off", "plate-gate", "cell-gate")
    grouped = {}
    for run in stems.get("perRun", []):
        if "pickupSummary" in run:
            grouped.setdefault(int(run["plateCount"]), {})[run["variant"]] = run["pickupSummary"]
    reports = []
    for count, arms in sorted(grouped.items()):
        present = [variant for variant in targets if variant in arms]
        events = {variant: {f"{row['layerId']}:{row['eventFrame']}": row
                           for row in arms[variant].get("eventWindows500ms", [])} for variant in present}
        common = set.intersection(*(set(events[variant]) for variant in present)) if len(present) == len(targets) else set()
        arm_reports = []
        for variant in present:
            all_rows = list(events[variant].values())
            matched = [events[variant][key] for key in sorted(common)]
            all_db = [row["focalToRestDb"] for row in all_rows if row.get("focalToRestDb") is not None]
            matched_db = [row["focalToRestDb"] for row in matched if row.get("focalToRestDb") is not None]
            ratios = []
            for row in arms[variant].get("bins", []):
                plate = row.get("plateSummedMeanSquare", 0)
                sphere = row.get("sphereMeanSquare", 0)
                if plate > 0 and sphere > 0:
                    ratios.append(10 * math.log10(sphere / plate))
            eff = [row.get("effectiveContributorCount") for row in arms[variant].get("bins", [])
                   if row.get("effectiveContributorCount") is not None]
            arm_reports.append({"variant": variant, "deliveredStrikeEventWindows": len(all_rows),
                "allDeliveredMedianFocalToRestDb": float(np.median(all_db)) if all_db else None,
                "matchedCommonKeyCount": len(common),
                "matchedCommonMedianFocalToRestDb": float(np.median(matched_db)) if matched_db else None,
                "matchedCommonP10P90Db": [float(np.quantile(matched_db, .1)), float(np.quantile(matched_db, .9))] if matched_db else None,
                "matchedDeltaVsFullDb": {"median": None, "p10": None, "p90": None},
                "effectiveContributorCountMedianP10P90": [float(np.quantile(eff, p)) for p in (.1, .5, .9)] if eff else None,
                "sphereToPlateSummedEnergyDbMedianP10P90": [float(np.quantile(ratios, p)) for p in (.1, .5, .9)] if ratios else None})
        by_variant = {row["variant"]: row for row in arm_reports}
        if len(present) == len(targets):
            full = events["full"]
            for variant in present:
                if variant == "full":
                    continue
                deltas = [events[variant][key]["focalToRestDb"] - full[key]["focalToRestDb"]
                          for key in common if events[variant][key].get("focalToRestDb") is not None
                          and full[key].get("focalToRestDb") is not None]
                by_variant[variant]["matchedDeltaVsFullDb"] = ({"median": float(np.median(deltas)),
                    "p10": float(np.quantile(deltas, .1)), "p90": float(np.quantile(deltas, .9))} if deltas else None)
        reports.append({"plateCount": count, "variantsPresent": present,
            "commonDeliveredStrikeKeysAcrossAllFour": len(common),
            "commonEventSelection": "intersection of unique layerId:eventFrame keys delivered by full, z-off, plate-gate, and cell-gate; conditional subset only",
            "arms": arm_reports})
    return reports


def write_listening_page(rows):
    sections = []
    for (count, variant), row in sorted(rows.items()):
        if variant == "full" or int(row["frames"]) != int(rows[(count, "full")]["frames"]):
            continue
        a, b = f"{count}-full.wav", f"{count}-{variant}.wav"
        if not (EVIDENCE / a).is_file() or not (EVIDENCE / b).is_file():
            continue
        sections.append(f'<section><h2>{count} plates: full vs {variant}</h2><div class="pair">'
            f'<label>A · full<audio controls preload="none" src="{a}"></audio></label>'
            f'<label>B · {variant}<audio controls preload="none" src="{b}"></audio></label></div></section>')
    html = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT exhibition audio A/B</title><style>body{font:16px/1.45 system-ui,sans-serif;max-width:980px;margin:2rem auto;padding:0 1rem;color:#202a33}section{border:1px solid #ccd3da;border-radius:8px;padding:1rem;margin:1rem 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}audio{display:block;width:100%;margin-top:.5rem}.note{color:#52606d}@media(max-width:650px){.pair{grid-template-columns:1fr}}</style>
<h1>ANT exhibition audio A/B</h1><p class="note">Local benchmark PCM at native digital level. Each pair uses the same Plate count and duration. The two-second precondition is included in each file. This page records no listening judgments.</p>
""" + "\n".join(sections) + "</html>\n"
    (EVIDENCE / "listening.html").write_text(html, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-plots", action="store_true")
    args = parser.parse_args()
    bench_path = EVIDENCE / "benchmark.json"
    bench = json.loads(bench_path.read_text(encoding="utf-8"))
    rows = {(int(x["plateCount"]), x["id"]): x for x in bench["results"]}
    if not rows or any(variant not in VARIANT_ORDER for _, variant in rows):
        raise ValueError("benchmark has no supported variant rows")
    if any(int(row["frames"]) <= PRECONDITION_S * RATE for row in rows.values()):
        raise ValueError("benchmark row has no measured samples after the precondition")
    counts = sorted({count for count, _ in rows})
    variants = [variant for variant in VARIANT_ORDER if any(v == variant for _, v in rows)]
    missing_full = [count for count in counts if (count, "full") not in rows]
    if missing_full:
        raise ValueError(f"missing full reference rows for Plate counts: {missing_full}")
    audio, hashes = {}, {}
    for count, variant in sorted(rows):
        path = EVIDENCE / f"{count}-{variant}.wav"
        audio[(count, variant)] = read_float_wav(path, int(rows[(count, variant)]["frames"]))
        if rows[(count, variant)].get("pcmSha256") != audio[(count, variant)][2]:
            raise ValueError(f"{path}: PCM data hash differs from benchmark receipt")
        hashes[path.name] = {"sha256": audio[(count, variant)][1], "bytes": audio[(count, variant)][3],
                             "benchmarkPcmSha256": rows[(count, variant)].get("pcmSha256")}
    stems_path = EVIDENCE / "stems-summary.json"
    stems_ref = None
    pickup_contribution_summary = None
    if stems_path.exists():
        stems = json.loads(stems_path.read_text(encoding="utf-8"))
        if stems.get("benchmarkSha256") != sha256(bench_path.read_bytes()):
            raise ValueError("stem summary was produced for a different benchmark manifest")
        for item in stems.get("perRun", []):
            if "pcmSha256" in item and rows.get((int(item["plateCount"]), item["variant"]), {}).get("pcmSha256") != item["pcmSha256"]:
                raise ValueError("stem summary PCM parity does not match the current benchmark")
        stems_ref = {"path": stems_path.relative_to(ROOT).as_posix(), "sha256": sha256(stems_path.read_bytes()),
                     "runs": len(stems.get("perRun", [])), "rawPerPlateAudioExported": False}
        pickup_contribution_summary = summarize_pickup_stems(stems)
    comparisons, skipped = [], []
    for count in counts:
        for variant in variants:
            if variant == "full":
                continue
            if (count, variant) not in rows:
                skipped.append({"plateCount": count, "variant": variant, "reason": "no benchmark row"})
                continue
            if int(rows[(count, variant)]["frames"]) != int(rows[(count, "full")]["frames"]):
                skipped.append({"plateCount": count, "variant": variant, "reason": "frame count differs from full reference"})
                continue
            m = metrics(audio[(count, "full")][0], audio[(count, variant)][0])
            comparisons.append({"plateCount": count, "variant": variant, **m})
    durations = {int(row["frames"]) / RATE - PRECONDITION_S for row in rows.values()}
    duration = max(durations)
    payload = {"schemaVersion": 1, "benchmark": {"path": bench_path.relative_to(ROOT).as_posix(),
                 "sha256": sha256(bench_path.read_bytes()), "rows": len(rows)},
        "inputAudio": hashes,
        "analysisWindow": {"preconditionSecondsExcluded": PRECONDITION_S, "measuredSecondsByRow": {
                               f"{count}-{variant}": int(row["frames"]) / RATE - PRECONDITION_S
                               for (count, variant), row in rows.items()},
                           "sampleRateHz": RATE, "channels": CHANNELS, "amplitudeNormalization": "none"},
        "comparisonDefinition": "Each variant compared with full at the same Plate count and exact frame count, analyzing samples after the precondition.",
        "perPlateStemsAvailable": False,
        "perPlateStemSummary": stems_ref,
        "pickupContributionSummary": pickup_contribution_summary,
        "attributionLimit": "The WAVs are mixed stereo PCM. Difference energy and spectral change cannot identify which Plate contributed or masked another. A separately hash-matched pickup summary, if present, describes component energy and remains distinct from masking or perception.",
        "perceptualLimit": "Numerical PCM differences describe signal changes only; they do not establish audibility, masking, preference, or perceived source identity.",
        "fixedPlotScales": {"waveformAmplitude": [-1, 1], "spectrogramPowerDbfs": [-120, 0], "spectrogramFrequencyHz": [0, 12000]},
        "comparisons": comparisons, "skippedComparisons": skipped}
    out = EVIDENCE / "acoustic-analysis.json"
    plots = False if args.no_plots or plt is None else make_plot(audio, counts, variants, duration)
    payload["plotStatus"] = "omitted by request" if args.no_plots else "generated" if plots else "Pillow and matplotlib unavailable"
    if not args.no_plots and plt is None and Image is not None:
        plots = make_pillow_plots(audio, counts, variants, duration)
        payload["plotStatus"] = "generated with Pillow fixed scales" if plots else payload["plotStatus"]
    write_listening_page(rows)
    out.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"analysis": str(out), "comparisons": len(comparisons), "plots": plots,
                      "perPlateStemsAvailable": False}, indent=2))


if __name__ == "__main__":
    main()
