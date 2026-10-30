#!/usr/bin/env python3
"""Render a deterministic, fixed-scale atlas from saved 600 s ANT maps."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-30-material-organism-feedback-discovery"
ARMS = [("control", "Control"), ("turning", "A · Turning"), ("stride", "B · Stride")]
OUT = PACKAGE / "atlas.png"
FONT_PATH = Path("C:/Windows/Fonts/segoeui.ttf")


def font(size):
    try:
        return ImageFont.truetype(str(FONT_PATH), size)
    except OSError:
        return ImageFont.load_default()


def load_arm(name):
    folder = PACKAGE / "data" / name
    with gzip.open(folder / "seed20261005-G-600s.json.gz", "rt", encoding="utf-8") as f:
        endpoint = json.load(f)
    with gzip.open(folder / "auxiliary.json.gz", "rt", encoding="utf-8") as f:
        auxiliary = json.load(f)
    assert endpoint["seconds"] == 600
    assert endpoint["pheromone"]["width"] == endpoint["surface"]["width"] == 96
    layers = [0] * (96 * 96)
    assert auxiliary["actualBirthMasks"]
    for birth in auxiliary["actualBirthMasks"]:
        mask = birth["mask"]
        assert len(mask) == len(layers)
        layers = [a + int(b) for a, b in zip(layers, mask)]
    return {
        "pheromone": endpoint["pheromone"]["values"],
        "surface": endpoint["surface"]["values"],
        "layers": layers,
    }


def ramp(value, maximum, stops):
    t = 0 if maximum <= 0 else min(1, max(0, value / maximum))
    pos = t * (len(stops) - 1)
    i = min(len(stops) - 2, int(pos))
    f = pos - i
    return tuple(round(stops[i][c] * (1 - f) + stops[i + 1][c] * f) for c in range(3))


def heat(values, maximum, stops, scale=4):
    image = Image.new("RGB", (96, 96))
    image.putdata([ramp(float(v), maximum, stops) for v in values])
    return image.resize((96 * scale, 96 * scale), Image.Resampling.NEAREST)


def render():
    data = {name: load_arm(name) for name, _ in ARMS}
    pmax = max(max(map(float, row["pheromone"])) for row in data.values())
    lmax = max(max(row["layers"]) for row in data.values())
    assert pmax > 0 and lmax > 0
    W, H = 1430, 1640
    im = Image.new("RGB", (W, H), "#10151b")
    d = ImageDraw.Draw(im)
    title, head, body, small = font(30), font(21), font(17), font(14)
    d.text((34, 22), "Material / organism feedback — saved 600 s atlas", font=title, fill="#f0f3f5")
    d.text((35, 65), "Three 96×96 endpoint maps · common coordinates and per-channel scales", font=body, fill="#aebbc5")
    cols = [(35, "Projected pheromone", f"shared 0–{pmax:.4g}"),
            (490, "Surface C", "native 0–1"),
            (945, "Material layer count L", f"shared 0–{lmax} plates")]
    for x, label, scale_label in cols:
        d.text((x, 112), label, font=head, fill="#e4e9ed")
        d.text((x, 141), scale_label, font=small, fill="#9aa9b4")
    starts = [185, 635, 1085]
    for (name, label), y in zip(ARMS, starts):
        d.text((35, y), label, font=head, fill="#e4e9ed")
        d.text((145, y + 4), "600 s", font=small, fill="#9aa9b4")
        map_y = y + 33
        row = data[name]
        for (x, _, _), key, maximum, colors in zip(
            cols,
            ("pheromone", "surface", "layers"),
            (pmax, 1.0, lmax),
            (((19, 28, 38), (45, 104, 135), (228, 187, 93)),
             ((19, 28, 38), (61, 117, 108), (223, 221, 160)),
             ((19, 28, 38), (96, 104, 127), (232, 185, 118))),
        ):
            tile = heat(row[key], maximum, colors)
            im.paste(tile, (x, map_y))
            d.rectangle((x, map_y, x + tile.width - 1, map_y + tile.height - 1), outline="#64717b")
        d.line((34, y + 440, 1390, y + 440), fill="#303a43", width=1)
    d.text((35, 1540), "Pheromone and Surface C: saved 600 s endpoint maps. L: sum of actualBirthMasks through 600 s.", font=body, fill="#c4cdd3")
    d.text((35, 1575), "Grid coordinates 0…1 on each axis; native y-down array order. No interpolation; nearest-neighbor display ×4.", font=small, fill="#9aa9b4")
    d.text((35, 1601), "P scale shared across arms; C native 0–1; L shared integer maximum. A/B labels identify probes, not outcomes.", font=small, fill="#9aa9b4")
    return im


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare rendered PNG bytes with saved atlas")
    args = parser.parse_args()
    import io
    buf = io.BytesIO()
    render().save(buf, format="PNG", optimize=False, compress_level=9)
    raw = buf.getvalue()
    if args.check:
        existing = OUT.read_bytes()
        if raw != existing:
            raise SystemExit("atlas byte check failed")
        print(f"byte check passed: {len(raw)} bytes sha256={hashlib.sha256(raw).hexdigest()}")
    else:
        OUT.write_bytes(raw)
        print(f"wrote {OUT.relative_to(ROOT)}: {len(raw)} bytes sha256={hashlib.sha256(raw).hexdigest()}")


if __name__ == "__main__":
    main()
