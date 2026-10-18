#!/usr/bin/env python3
"""Illustrate three requested pairs using frozen descriptors; no new metrics."""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/ant/evidence/2026-10-18-plate-temporal-modulation"
PAIRS = (
    ("20261006-trail-plate-24", "20261005-trail-plate-23"),
    ("20261005-trail-plate-27", "20261007-trail-plate-31"),
    ("20261005-trail-plate-15", "20261006-trail-plate-17"),
)
COLORS = ("#006FA6", "#BA4B00")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    freeze_bytes = (OUT / "freeze.json").read_bytes()
    assert sha256(freeze_bytes) == (OUT / "freeze.sha256").read_text().split()[0]
    freeze = json.loads(freeze_bytes)
    for row in freeze["artifactReceipts"]:
        data = (OUT / row["path"]).read_bytes()
        assert len(data) == row["bytes"] and sha256(data) == row["sha256"]
    analysis = json.loads((OUT / "analysis.json").read_bytes())
    series = json.loads(gzip.decompress((OUT / "response-series.json.gz").read_bytes()))
    descriptors = {row["id"]: row for row in analysis["responseDescriptors"]}
    responses = {row["id"]: row for row in series["responses"]}
    assert len(descriptors) == len(responses) == 42
    times = np.asarray(series["timesEnvelopeCenterSeconds"][:278])
    frequencies = np.arange(3, 18) * 48_000 / (256 * 84)
    image = Image.new("RGB", (1640, 1120), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=18)
    small = ImageFont.load_default(size=15)
    title = ImageFont.load_default(size=24)
    draw.text((35, 22), "Frozen temporal examples: all responses at p50", fill="#202020", font=title)
    draw.text((35, 60), "Blue/orange identify the listed source Plates; these panels do not rank listener confidence.", fill="#333333", font=font)
    draw.text((35, 84), "Gray: fixed 50-500 ms estimator interval. Curves use complete frames; every row uses common axes.", fill="#555555", font=small)

    def axes(box, xlim, ylim, xticks, yticks, xlabel):
        left, top, right, bottom = box
        def point(x, y):
            return (left + (x - xlim[0]) / (xlim[1] - xlim[0]) * (right - left),
                    bottom - (np.clip(y, *ylim) - ylim[0]) / (ylim[1] - ylim[0]) * (bottom - top))
        for value in yticks:
            _, y = point(xlim[0], value)
            draw.line((left, y, right, y), fill="#DDDDDD")
            draw.text((left - 42, y - 8), str(value), font=small, fill="#555555")
        for value in xticks:
            x, _ = point(value, ylim[0])
            draw.line((x, bottom, x, bottom + 4), fill="#555555")
            draw.text((x - 10, bottom + 8), str(value), font=small, fill="#555555")
        draw.rectangle(box, outline="#888888")
        draw.text((left + 150, bottom + 33), xlabel, font=small, fill="#444444")
        return point

    for index, pair in enumerate(PAIRS):
        y = 110 + index * 315
        draw.text((35, y), f"{pair[0]}  /  {pair[1]}", font=font, fill="#202020")
        draw.text((75, y + 30), "Pooled ERB power / own fixed-gain full-clip PCM RMS squared (dB)", font=small, fill="#333333")
        draw.text((900, y + 30), "Frozen unit-sum residual modulation-rate spectra", font=small, fill="#333333")
        left_box = (80, y + 60, 770, y + 240)
        right_box = (910, y + 60, 1570, y + 240)
        # Shade the fixed estimator interval without hiding the complete tail.
        for start, end in ((0.05, 0.5),):
            x1 = left_box[0] + start / 1.5 * (left_box[2] - left_box[0])
            x2 = left_box[0] + end / 1.5 * (left_box[2] - left_box[0])
            draw.rectangle((x1, left_box[1], x2, left_box[3]), fill="#F0F0F0")
        lp = axes(left_box, (0, 1.5), (-35, 20), (0, 0.5, 1.0, 1.5), (-30, -15, 0, 15), "Time from file start (s)")
        rp = axes(right_box, (6, 40), (0, 1), (10, 20, 30, 40), (0, 0.5, 1), "Residual-spectrum frequency (Hz)")
        for key, color in zip(pair, COLORS):
            source_id = key + "-p50-native"
            response, descriptor = responses[source_id], descriptors[source_id]
            power = np.asarray(response["pooledErbPower"][:278]).sum(axis=1)
            rms = descriptor["rawFixedGain"]["full_0_1500msRms"]
            envelope = 10 * np.log10(np.maximum(power, 1e-30) / rms ** 2)
            spectrum = np.asarray(descriptor["modulationSpectrum"])
            assert power.shape == times.shape == (278,) and np.isfinite(envelope).all()
            assert spectrum.shape == (15,) and np.isclose(spectrum.sum(), 1)
            draw.line([lp(x, v) for x, v in zip(times, envelope)], fill=color, width=2)
            draw.line([rp(x, v) for x, v in zip(frequencies, spectrum)], fill=color, width=3)
    draw.text((35, 1070), "STFT power scale is descriptive, not calibrated energy. Plot normalization is display-only; frozen metrics remain unchanged.", font=small, fill="#333333")
    output = OUT / "temporal-examples.png"
    image.save(output)
    manifest = {
        "schemaVersion": 1, "role": "post-freeze illustration, no descriptor changes",
        "freezeSha256": sha256(freeze_bytes), "numpyVersion": np.__version__, "pillowVersion": PILLOW_VERSION,
        "script": {"path": str(Path(__file__).relative_to(ROOT)), "sha256": sha256(Path(__file__).read_bytes())},
        "sourceArtifacts": [row for row in freeze["artifactReceipts"] if row["path"] in ("analysis.json", "response-series.json.gz")],
        "artifact": {"path": output.name, "bytes": output.stat().st_size, "sha256": sha256(output.read_bytes())},
        "checks": {"frozenArtifactReceiptsVerified": True, "responseCount": len(responses),
                   "finite278FrameEnvelopes": True, "unitSum15BinSpectra": True},
    }
    (OUT / "visualization-manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode())
    print(json.dumps(manifest["artifact"]))


if __name__ == "__main__":
    main()
