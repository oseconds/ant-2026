"""Render descriptive temporal scope atlases from saved event analyses."""
import argparse
import hashlib
import json
import platform
from io import BytesIO
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-event-evolved-scope"
PANEL = 640
WORLD = 96
CELL = PANEL / WORLD
E_COLOR, H_COLOR = (247, 247, 247), (55, 58, 62)
RETAINED, GAINED, LOST, CORE = (40, 110, 190), (36, 160, 90), (205, 55, 55), (15, 55, 125)
WHITE, BLACK = (255, 255, 255), (20, 20, 20)
FONT, SMALL = ImageFont.load_default(size=18), ImageFont.load_default(size=14)
MILESTONES = [(0, "START"), (5, "+5 s"), (10, "+10 s"), (15, "+15 s"), (20, "COMMIT")]


def sets(row):
    return {key: set(row[key]) for key in ("I", "H", "E", "retained", "gained", "lost", "continuousSelectedCore")}


def point(draw, index, color):
    x, y = index % WORLD, index // WORLD
    assert 0 <= x < WORLD and 0 <= y < WORLD
    px, py = (x + .5) * CELL, (y + .5) * CELL
    draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=color)
    return x, y, round(px, 6), round(py, 6)


def panel(row, label, start=False):
    image = Image.new("RGB", (PANEL, PANEL), WHITE)
    draw = ImageDraw.Draw(image)
    data = sets(row)
    # The light E field is a pixel background; H and selected masks remain point overlays.
    for index in sorted(data["E"]):
        x, y = index % WORLD, index // WORLD
        draw.rectangle((round(x * CELL), round(y * CELL), round((x + 1) * CELL) - 1,
                        round((y + 1) * CELL) - 1), fill=E_COLOR)
    before = 0
    for y in range(WORLD):
        for x in range(WORLD):
            px, py = round((x + .5) * CELL), round((y + .5) * CELL)
            expected = E_COLOR if y * WORLD + x in data["E"] else WHITE
            assert image.getpixel((px, py)) == expected
            before += 1
    # Draw lower-priority points first so the semantic masks remain visible.
    for key, color in (("H", H_COLOR), ("I", RETAINED if not start else CORE),
                       ("retained", RETAINED), ("gained", GAINED), ("lost", LOST),
                       ("continuousSelectedCore", CORE)):
        for index in sorted(data[key]):
            point(draw, index, color)
    # Assert the final semantic color at all cell centers using the overlay draw priority.
    for y in range(WORLD):
        for x in range(WORLD):
            index = y * WORLD + x
            expected = (CORE if index in data["continuousSelectedCore"] or (start and index in data["I"])
                        else LOST if index in data["lost"]
                        else GAINED if index in data["gained"]
                        else RETAINED if index in data["retained"] or index in data["I"]
                        else H_COLOR if index in data["H"]
                        else E_COLOR if index in data["E"] else WHITE)
            px, py = round((x + .5) * CELL), round((y + .5) * CELL)
            assert image.getpixel((px, py)) == expected
    draw.rectangle((0, 0, PANEL - 1, PANEL - 1), outline=(70, 70, 70))
    counts = {"H": len(data["H"]), "I": len(data["I"]), "retained": len(data["retained"]),
              "gained": len(data["gained"]), "lost": len(data["lost"]),
              "continuousSelectedCore": len(data["continuousSelectedCore"]), "E": len(data["E"])}
    return image, {"semanticCounts": counts, "preAndPostOverlayCentersChecked": before}


def details(row, start=False):
    sim = row.get("similarity") or {}
    turnover = "gain/loss=n/a" if start else f"gain={len(row['gained'])} loss={len(row['lost'])}"
    similarity = "mask/path=n/a" if start else f"mask={sim.get('maskJaccard', float('nan')):.3f} path={sim.get('pathForward', float('nan')):.3f}"
    return (f"t={row['seconds']:.3f}s age={row['stableSeconds']:.3f}s | I={row['ICount']} | {turnover} | {similarity}")


def legend(draw, y):
    entries = [(E_COLOR, "E pixel field"), (H_COLOR, "H"), (RETAINED, "retained I"),
               (GAINED, "gained"), (LOST, "lost"), (CORE, "continuous selected core")]
    x = 14
    for color, label in entries:
        draw.ellipse((x, y + 3, x + 9, y + 12), fill=color, outline=(100, 100, 100))
        draw.text((x + 13, y), label, fill=BLACK, font=SMALL)
        x += 24 + len(label) * 7


def render_temporal(data):
    image = Image.new("RGB", (20 + 5 * 660, 180 + 2 * 740), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((12, 10), "EVENT EVOLVED SCOPE | TEMPORAL ATLAS", fill=BLACK, font=FONT)
    draw.text((12, 38), "96x96 source world; 640x640 panels; y-down. Point overlays only; no body fill, width, or connecting lines.", fill=BLACK, font=SMALL)
    draw.text((12, 59), "Core = every anchor so far. Retained = previous saved 1 s analysis intersection. Gain/loss compare immediately previous saved anchor.", fill=BLACK, font=SMALL)
    draw.text((12, 80), "START shows current I normally; gain/loss and within-event similarity are n/a. Mask/path similarity is recomputed from saved inputs.", fill=BLACK, font=SMALL)
    legend(draw, 103)
    receipt, checks = [], 0
    for ri, event in enumerate(data["events"]):
        for ci, (idx, name) in enumerate(MILESTONES):
            row = event["rows"][idx]
            x, y = 12 + ci * 660, 145 + ri * 740
            draw.text((x, y), f"{event['id']} | {name}", fill=BLACK, font=FONT)
            tile, check = panel(row, name, start=(idx == 0))
            image.paste(tile, (x, y + 27))
            draw.text((x, y + 675), details(row, start=(idx == 0)), fill=BLACK, font=SMALL)
            draw.text((x, y + 696), f"H={row['HCount']} E={row['ECount']} | source row {idx}", fill=BLACK, font=SMALL)
            receipt.append({"event": event["id"], "label": name, "rowIndex": idx,
                            "seconds": row["seconds"], "I": row["ICount"], "gain": None if idx == 0 else len(row["gained"]),
                            "loss": None if idx == 0 else len(row["lost"]),
                            "sourceRowSha256": hashlib.sha256(json.dumps(row, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                            "sourceCellCentersAndBoundsChecked": check["preAndPostOverlayCentersChecked"],
                            "semanticCounts": check["semanticCounts"]})
            checks += check["preAndPostOverlayCentersChecked"]
    stream = BytesIO(); image.save(stream, format="PNG", optimize=False)
    return stream.getvalue(), receipt, checks


def render_turnover(data):
    image = Image.new("RGB", (20 + 2 * 660, 180 + 2 * 740), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((12, 10), "EVENT EVOLVED SCOPE | LARGEST DESCRIPTIVE TURNOVER", fill=BLACK, font=FONT)
    draw.text((12, 38), "Each row shows the adjacent saved 1 s anchors with greatest |gained|+|lost|; ties choose earliest.", fill=BLACK, font=SMALL)
    draw.text((12, 59), "This is a descriptive extreme, not a stability score or material selector. Point overlays only; same 96x96 world.", fill=BLACK, font=SMALL)
    draw.text((12, 80), "Core = every anchor so far; retained/gained/lost use the immediately previous saved anchor.", fill=BLACK, font=SMALL)
    legend(draw, 103)
    receipt, checks = [], 0
    for ri, event in enumerate(data["events"]):
        rows = event["rows"]
        transition = max(range(1, len(rows)), key=lambda i: len(rows[i]["gained"]) + len(rows[i]["lost"]))
        for ci, idx in enumerate((transition - 1, transition)):
            row = rows[idx]
            x, y = 12 + ci * 660, 145 + ri * 740
            draw.text((x, y), f"{event['id']} | saved row {idx} | t={row['seconds']:.3f}s", fill=BLACK, font=FONT)
            tile, check = panel(row, "turnover")
            image.paste(tile, (x, y + 27))
            draw.text((x, y + 675), details(row), fill=BLACK, font=SMALL)
            draw.text((x, y + 696), f"H={row['HCount']} E={row['ECount']} | turnover={len(row['gained']) + len(row['lost'])}", fill=BLACK, font=SMALL)
            receipt.append({"event": event["id"], "rowIndex": idx, "seconds": row["seconds"],
                            "transitionCurrentRow": transition, "turnover": len(rows[transition]["gained"]) + len(rows[transition]["lost"]),
                            "sourceRowSha256": hashlib.sha256(json.dumps(row, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                            "sourceCellCentersAndBoundsChecked": check["preAndPostOverlayCentersChecked"],
                            "semanticCounts": check["semanticCounts"]})
            checks += check["preAndPostOverlayCentersChecked"]
    stream = BytesIO(); image.save(stream, format="PNG", optimize=False)
    return stream.getvalue(), receipt, checks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = (BASE / "analysis.json").read_bytes().replace(b"\r\n", b"\n")
    data = json.loads(raw)
    specs = [("temporal-atlas.png", render_temporal), ("turnover-detail.png", render_turnover)]
    receipt = {"inputSha256": hashlib.sha256(raw).hexdigest(), "python": platform.python_version(),
               "pillow": PIL.__version__, "world": [WORLD, WORLD], "panel": [PANEL, PANEL],
               "mapping": "linear cell centers; source bounds [0,96)x[0,96), y-down",
               "figures": []}
    for name, renderer in specs:
        content, panels, checks = renderer(data)
        path = BASE / name
        if args.check:
            assert path.read_bytes() == content, f"stale artifact: {name}"
        else:
            path.write_bytes(content)
        receipt["figures"].append({"path": name, "sha256": hashlib.sha256(content).hexdigest(),
                                   "panels": panels, "sourceCellCentersAndBoundsChecked": checks})
    text = json.dumps(receipt, indent=2) + "\n"
    path = BASE / "atlas-validation.json"
    if args.check:
        assert path.read_text(encoding="utf-8") == text, "stale validation receipt"
    else:
        path.write_text(text, encoding="utf-8", newline="\n")
    print(json.dumps({"figures": [{"path": f["path"], "panels": len(f["panels"]),
                                  "sourceCellCentersAndBoundsChecked": f["sourceCellCentersAndBoundsChecked"]}
                      for f in receipt["figures"]]}))


if __name__ == "__main__":
    main()
