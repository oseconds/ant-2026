"""Fixed-frame display for the selected frozen BODY scope comparisons."""
import argparse
import hashlib
import json
import platform
from io import BytesIO
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-body-diverse-scope-atlas"
PANEL = 320
COLORS = {"P": (102, 112, 133), "K": (143, 195, 255), "H": (243, 198, 165)}
INK = (16, 42, 67)


def plot(data, group):
    events = data["events"]
    ids = ["P", "K", "H"] if group == "A" else ["K", "U", "W", "S"]
    left, gap, top, row_height = 235, 18, 112, 388
    width = left + len(ids) * (PANEL + gap) + 10
    height = top + len(events) * row_height + 15
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    title = ImageFont.load_default(size=19)
    body = ImageFont.load_default(size=15)
    small = ImageFont.load_default(size=13)
    title_text = ("ATLAS A | OBJECT ONTOLOGY | ADDITIONAL NATURAL COMMIT SCOPES"
                  if group == "A" else "ATLAS B | LOCAL ENVIRONMENTAL SHAPING | EXACT B MAPS UNAVAILABLE")
    draw.text((12, 10), title_text, fill="black", font=title)
    draw.text((12, 38), "Frozen current-G/H0 seed 20261005. Same 96x96 world frame, y-down, nearest-neighbor 320x320.", fill="black", font=body)
    draw.text((12, 60), "Gray=P production; blue=K fixed .012 sections; peach=H convex lamina. Navy lines/dots=I graph overlay only.", fill="black", font=body)
    if group == "B":
        draw.text((12, 82), "U/W/S omitted per row: exact commit-time chemical B rasters are not in frozen evidence.", fill="black", font=body)
    checks = 0
    for row_index, event in enumerate(events):
        y = top + row_index * row_height
        metrics = event["metrics"]
        meta = [event["id"], f"COMMIT {event['commitSeconds']:.6f} s", f"selected: {event['selectedFor']}",
                f"I nodes/edges: {metrics['nodeCount']}/{metrics['edgeCount']}",
                f"junctions: {metrics['junctionCount']} | terminals: {metrics['terminalCount']}",
                f"path tortuosity: {metrics['tortuosity']:.3f}",
                f"box: {metrics['bbox']['widthCells']}x{metrics['bbox']['heightCells']}"]
        for line, text in enumerate(meta):
            draw.text((12, y + 3 + line * 23), text, fill="black", font=small if line > 1 else body)
        cases = {case["id"]: case for case in event["cases"]}
        for col, code in enumerate(ids):
            x = left + col * (PANEL + gap)
            draw.text((x, y), {"P": "P | production", "K": "K | fixed sleeve", "H": "H | cohesive lamina",
                              "U": "U | uniform mean", "W": "W | attached B", "S": "S | ambient B"}[code], fill="black", font=body)
            if code in cases:
                mask = cases[code]["mask"]
                assert len(mask) == 96 * 96 and all(value in (0, 1) for value in mask)
                panel = Image.new("RGB", (96, 96), "white")
                pixels = panel.load()
                for i, value in enumerate(mask):
                    if value:
                        pixels[i % 96, i // 96] = COLORS[code]
                panel = panel.resize((PANEL, PANEL), resample=Image.Resampling.NEAREST)
                base = ImageDraw.Draw(panel)
                for i, value in enumerate(mask):
                    cx = int((i % 96 + .5) * PANEL / 96)
                    cy = int((i // 96 + .5) * PANEL / 96)
                    assert panel.getpixel((cx, cy)) == (COLORS[code] if value else (255, 255, 255))
                    checks += 1
                canvas.paste(panel, (x, y + 24))
                context = ImageDraw.Draw(canvas)
                for a, b in event["scopeEdges"]:
                    ax, ay = (a % 96 + .5) * PANEL / 96, (a // 96 + .5) * PANEL / 96
                    bx, by = (b % 96 + .5) * PANEL / 96, (b // 96 + .5) * PANEL / 96
                    context.line((x + ax, y + 24 + ay, x + bx, y + 24 + by), fill=INK, width=1)
                for node in event["scopeNodes"]:
                    nx, ny = (node % 96 + .5) * PANEL / 96, (node // 96 + .5) * PANEL / 96
                    context.ellipse((x + nx - 1, y + 24 + ny - 1, x + nx + 1, y + 24 + ny + 1), fill=INK)
                draw.rectangle((x, y + 24, x + PANEL - 1, y + 24 + PANEL - 1), outline=(35, 35, 35), width=1)
                draw.text((x, y + 24 + PANEL + 5), f"{cases[code]['cells']} source cells; 4-components={len(cases[code]['components4'])}",
                          fill="black", font=small)
            else:
                card = Image.new("RGB", (PANEL, PANEL), (242, 244, 247))
                card_draw = ImageDraw.Draw(card)
                card_draw.rectangle((0, 0, PANEL - 1, PANEL - 1), outline=(160, 160, 160), width=2)
                card_draw.text((26, 122), "OMITTED", fill=(75, 85, 99), font=title)
                card_draw.text((26, 152), "No exact commit-time", fill=(75, 85, 99), font=body)
                card_draw.text((26, 174), "chemical B raster", fill=(75, 85, 99), font=body)
                card_draw.text((26, 196), "available in frozen data", fill=(75, 85, 99), font=body)
                canvas.paste(card, (x, y + 24))
                draw.text((x, y + 24 + PANEL + 5), "candidate not approximated", fill="black", font=small)
    stream = BytesIO()
    canvas.save(stream, format="PNG", optimize=False)
    return stream.getvalue(), checks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data_path = BASE / "atlas-data.json"
    data_bytes = data_path.read_bytes()
    data = json.loads(data_bytes)
    receipt = {"pillow": PIL.__version__, "python": platform.python_version(), "inputSha256": hashlib.sha256(data_bytes).hexdigest(),
               "sourceGrid": [96, 96], "panelPixels": [PANEL, PANEL], "mapping": data["display"]["mapping"], "figures": []}
    for group, name in [("A", "atlas-a.png"), ("B", "atlas-b.png")]:
        image, checks = plot(data, group)
        digest = hashlib.sha256(image).hexdigest()
        target = BASE / name
        if args.check:
            assert target.read_bytes() == image
        else:
            target.write_bytes(image)
        receipt["figures"].append({"path": name, "group": group, "sha256": digest, "sourceCellCentersChecked": checks})
    content = json.dumps(receipt, indent=2) + "\n"
    target = BASE / "atlas-validation.json"
    if args.check:
        assert target.read_text(encoding="utf-8") == content
    else:
        target.write_text(content, encoding="utf-8", newline="\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
