"""Joint structural units and body countermodels; no production rendering."""
import argparse
import hashlib
import json
import platform
from io import BytesIO
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-joint-scope-body-grammar"
PANEL = 640
BODY, SCOPE, CONTEXT = (150, 150, 150), (12, 83, 160), (214, 219, 225)
WHITE, OUTSIDE = (255, 255, 255), (238, 238, 238)
FONT = ImageFont.load_default(size=18)
SMALL = ImageFont.load_default(size=15)


def origin(unit, size):
    xs = [i % 96 for i in unit["scope"]]
    ys = [i // 96 for i in unit["scope"]]
    return ((min(xs) + max(xs)) // 2 - size // 2,
            (min(ys) + max(ys)) // 2 - size // 2)


def panel(unit, code, context, crop):
    x0, y0, size = crop
    values = unit[code]
    assert len(values) == 96 * 96 and set(values) <= {0, 1}
    image = Image.new("RGB", (size, size), OUTSIDE)
    for yy in range(size):
        for xx in range(size):
            x, y = x0 + xx, y0 + yy
            if 0 <= x < 96 and 0 <= y < 96:
                image.putpixel((xx, yy), BODY if values[y * 96 + x] else WHITE)
    image = image.resize((PANEL, PANEL), Image.Resampling.NEAREST)
    checks = 0
    for yy in range(size):
        for xx in range(size):
            x, y = x0 + xx, y0 + yy
            expected = OUTSIDE
            if 0 <= x < 96 and 0 <= y < 96:
                expected = BODY if values[y * 96 + x] else WHITE
            assert image.getpixel((int((xx + .5) * PANEL / size),
                                   int((yy + .5) * PANEL / size))) == expected
            checks += 1
    draw = ImageDraw.Draw(image)
    for group, color, radius in [(context, CONTEXT, 1), (unit["scope"], SCOPE, 1)]:
        for i in group:
            x, y = i % 96 - x0, i // 96 - y0
            if 0 <= x < size and 0 <= y < size:
                px, py = (x + .5) * PANEL / size, (y + .5) * PANEL / size
                draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=color)
    draw.rectangle((0, 0, PANEL - 1, PANEL - 1), outline=(50, 50, 50))
    return image, checks


def render(data, detail):
    cols = 4 if detail else 3
    width, height = 20 + cols * 660, 100 + 2 * 730
    image = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((12, 10), "JOINT SCOPE / BODY | " + ("LOCAL SPANNING COUNTERMODELS" if detail else "SAME SLEEVE, DIFFERENT STRUCTURAL UNITS"), fill="black", font=FONT)
    draw.text((12, 39), "Current-G/H0, seed20261005; frozen P1/P2. Gray=body; blue=chosen structural samples; pale dots=I context only.", fill="black", font=SMALL)
    draw.text((12, 63), "40x40 source-cell crops at 16 px/cell; gray outside world. NOT natural deposition or a mode router." if detail
              else "Full96x96 world at640x640, y-down. Local units use the reconstructed selector parent tree; no new scope law.", fill="black", font=SMALL)
    receipt, total = [], 0
    for row, event in enumerate(data["events"]):
        if detail:
            specs = [("motif", "K", "Junction / sleeve"), ("motif", "H", "Same junction / convex span"),
                     ("closure", "K", "Full-H face boundary / sleeve"), ("closure", "L", "Same boundary / enclosed fill")]
        else:
            specs = [("full", "K", "Full COMMIT I / sleeve"), ("chain", "K", "Longest local chain / sleeve"),
                     ("motif", "K", "Largest junction motif / sleeve")]
        for col, (unit_name, code, label) in enumerate(specs):
            unit = event[unit_name]
            x, y = 12 + col * 660, 100 + row * 730
            if detail:
                x0, y0 = origin(unit, 40)
                crop = (x0, y0, 40)
            else:
                crop = (0, 0, 96)
            draw.text((x, y), f"P{row + 1} | {label}", fill="black", font=FONT)
            tile, checks = panel(unit, code, event["context"], crop)
            image.paste(tile, (x, y + 28))
            cells = sum(unit[code])
            draw.text((x, y + 675), f"scope {len(unit['scope'])} | body {cells} cells | COMMIT {event['commitSeconds']:.6f} s", fill="black", font=SMALL)
            draw.text((x, y + 697), f"source origin ({crop[0]},{crop[1]}), extent {crop[2]}x{crop[2]}" + (" | H != selected I" if unit_name == "closure" else ""), fill="black", font=SMALL)
            receipt.append({"event": event["id"], "unit": unit_name, "body": code,
                            "sourceCrop": crop, "bodyCells": cells, "pixelCentersChecked": checks})
            total += checks
    stream = BytesIO()
    image.save(stream, format="PNG", optimize=False)
    return stream.getvalue(), receipt, total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = (BASE / "analysis.json").read_bytes().replace(b"\r\n", b"\n")
    data = json.loads(raw)
    receipt = {"inputSha256": hashlib.sha256(raw).hexdigest(), "python": platform.python_version(),
               "pillow": PIL.__version__, "overlay": "points only; no independent render geometry", "figures": []}
    for detail, name in [(False, "scope-units-atlas.png"), (True, "local-body-atlas.png")]:
        image, panels, checks = render(data, detail)
        path = BASE / name
        if args.check:
            assert path.read_bytes() == image
        else:
            path.write_bytes(image)
        receipt["figures"].append({"path": name, "sha256": hashlib.sha256(image).hexdigest(),
                                   "panels": panels, "pixelCentersChecked": checks})
    text = json.dumps(receipt, indent=2) + "\n"
    path = BASE / "atlas-validation.json"
    if args.check:
        assert path.read_text(encoding="utf-8") == text
    else:
        path.write_text(text, encoding="utf-8", newline="\n")
    print(json.dumps({"figures": [{"path": f["path"], "checks": f["pixelCentersChecked"]} for f in receipt["figures"]]}))


if __name__ == "__main__":
    main()
