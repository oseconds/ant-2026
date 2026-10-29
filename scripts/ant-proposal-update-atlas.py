"""Render the frozen P1/P2 proposal-update diagnostic atlas."""

import argparse
import hashlib
import json
import platform
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-proposal-update-diagnostic"
DATA = BASE / "atlas-data.json"
IMAGE_PATH = BASE / "selection-update-atlas.png"
VALIDATION_PATH = BASE / "atlas-validation.json"
WORLD = 96
CELL = 4
MAP = WORLD * CELL
PANEL_WIDTH = 420
PANEL_HEIGHT = 470
OUT_WIDTH = 20 + 5 * PANEL_WIDTH
OUT_HEIGHT = 285 + 2 * PANEL_HEIGHT

WHITE = (255, 255, 255)
BLACK = (24, 27, 31)
GRID = (217, 221, 225)
E_COLOR = (238, 241, 244)
START_I = (39, 57, 91)
RETAINED = (36, 132, 92)
VALID_DROPPED = (232, 148, 33)
INVALIDATED = (198, 62, 68)
GAINED = (89, 103, 204)
P1_LINE = (35, 99, 175)
P2_LINE = (164, 66, 117)
FONT = ImageFont.load_default(size=18)
SMALL = ImageFont.load_default(size=14)
TINY = ImageFont.load_default(size=12)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def validate_cells(cells):
    values = set(cells)
    assert len(values) == len(cells)
    assert all(isinstance(i, int) and 0 <= i < WORLD * WORLD for i in values)
    return values


def panel_expected(panel):
    categories = panel["categories"]
    if panel["anchorIndex"] == 0:
        e = validate_cells(categories["E"])
        selected = validate_cells(categories["startSelected"])
        assert selected <= e
        return e, {"startSelected": selected}
    e = validate_cells(categories["E"])
    groups = {
        "retained": validate_cells(categories["retained"]),
        "stillValidButDropped": validate_cells(categories["stillValidButDropped"]),
        "noLongerEQualified": validate_cells(categories["noLongerEQualified"]),
        "newlySelected": validate_cells(categories["newlySelected"]),
    }
    previous_partition = (groups["retained"] | groups["stillValidButDropped"]
                          | groups["noLongerEQualified"])
    assert sum(len(groups[name]) for name in (
        "retained", "stillValidButDropped", "noLongerEQualified"
    )) == len(previous_partition)
    assert groups["retained"].isdisjoint(groups["stillValidButDropped"])
    assert groups["retained"].isdisjoint(groups["noLongerEQualified"])
    assert groups["stillValidButDropped"].isdisjoint(groups["noLongerEQualified"])
    assert groups["newlySelected"].isdisjoint(previous_partition)
    assert groups["retained"] | groups["newlySelected"] <= e
    assert groups["stillValidButDropped"] <= e
    assert not groups["noLongerEQualified"] & e
    return e, groups


def category_color(index, e, groups, start):
    if start:
        return START_I if index in groups["startSelected"] else E_COLOR if index in e else WHITE
    for name, color in (
        ("retained", RETAINED),
        ("stillValidButDropped", VALID_DROPPED),
        ("noLongerEQualified", INVALIDATED),
        ("newlySelected", GAINED),
    ):
        if index in groups[name]:
            return color
    return E_COLOR if index in e else WHITE


def draw_panel(canvas, event_id, panel, x, y):
    draw = ImageDraw.Draw(canvas)
    labels = " / ".join(panel["labels"])
    draw.text((x, y), event_id + " | " + labels, fill=BLACK, font=FONT)
    draw.text((x, y + 23), "t=" + format(panel["seconds"], ".3f") + " s", fill=BLACK, font=SMALL)
    map_x, map_y = x + 24, y + 43
    e, groups = panel_expected(panel)
    start = panel["anchorIndex"] == 0
    for index in sorted(e):
        cx, cy = index % WORLD, index // WORLD
        left, top = map_x + cx * CELL, map_y + cy * CELL
        draw.rectangle((left, top, left + CELL - 1, top + CELL - 1), fill=E_COLOR)
    colors = {"startSelected": START_I, "retained": RETAINED,
              "stillValidButDropped": VALID_DROPPED, "noLongerEQualified": INVALIDATED,
              "newlySelected": GAINED}
    for name, cells in groups.items():
        for index in sorted(cells):
            cx, cy = index % WORLD, index // WORLD
            left, top = map_x + cx * CELL, map_y + cy * CELL
            draw.rectangle((left, top, left + CELL - 1, top + CELL - 1), fill=colors[name])
    for tick in (0, 24, 48, 72, 96):
        pos = map_x + tick * CELL
        draw.line((pos, map_y, pos, map_y + MAP), fill=GRID, width=1)
        pos_y = map_y + tick * CELL
        draw.line((map_x, pos_y, map_x + MAP, pos_y), fill=GRID, width=1)
    draw.rectangle((map_x, map_y, map_x + MAP - 1, map_y + MAP - 1), outline=(90, 94, 100))
    for row in range(WORLD):
        for column in range(WORLD):
            index = row * WORLD + column
            px, py = map_x + column * CELL + CELL // 2, map_y + row * CELL + CELL // 2
            assert canvas.getpixel((px, py)) == category_color(index, e, groups, start)
    counts = {name: len(cells) for name, cells in groups.items()}
    if start:
        first_detail = "E " + str(len(e)) + " | I " + str(counts["startSelected"])
        second_detail = ""
    else:
        first_detail = ("kept " + str(counts["retained"]) + " | valid but dropped "
                        + str(counts["stillValidButDropped"]))
        second_detail = ("invalid " + str(counts["noLongerEQualified"]) + " | new "
                         + str(counts["newlySelected"]) + " | E " + str(len(e)))
    draw.text((x, map_y + MAP + 5), first_detail, fill=BLACK, font=TINY)
    if second_detail:
        draw.text((x, map_y + MAP + 20), second_detail, fill=BLACK, font=TINY)
    return {
        "event": event_id,
        "anchorIndex": panel["anchorIndex"],
        "timeMs": panel["timeMs"],
        "labels": panel["labels"],
        "ECells": len(e),
        "categoryCounts": counts,
        "cellCentersChecked": WORLD * WORLD,
    }


def draw_survival_chart(canvas, events):
    draw = ImageDraw.Draw(canvas)
    left, top, width, height = 82, 82, OUT_WIDTH - 125, 130
    draw.text((left, 53), "START I still qualified in E at each saved anchor", fill=BLACK, font=FONT)
    draw.line((left + 470, 61, left + 505, 61), fill=P1_LINE, width=3)
    draw.text((left + 512, 54), "P1", fill=P1_LINE, font=SMALL)
    draw.line((left + 560, 61, left + 595, 61), fill=P2_LINE, width=3)
    draw.text((left + 602, 54), "P2", fill=P2_LINE, font=SMALL)
    for value in (0, 0.25, 0.5, 0.75, 1.0):
        y = top + height - round(value * height)
        draw.line((left, y, left + width, y), fill=GRID, width=1)
        draw.text((left - 34, y - 6), format(value, ".2f"), fill=BLACK, font=TINY)
    for seconds in (0, 5, 10, 15, 20):
        x = left + round(seconds / 20 * width)
        draw.line((x, top, x, top + height), fill=(235, 237, 239), width=1)
        draw.text((x - 5, top + height + 4), str(seconds), fill=BLACK, font=TINY)
    receipt = []
    for event, color in zip(events, (P1_LINE, P2_LINE)):
        series = event["startSurvival"]
        points = []
        for row in series:
            px = left + round(row["secondsSinceStart"] / 20 * width)
            py = top + height - round(row["survivalRate"] * height)
            points.append((px, py))
        draw.line(points, fill=color, width=3)
        for px, py in points:
            draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=color)
        receipt.append({"event": event["id"], "anchors": len(series),
                        "startCells": series[0]["denominator"],
                        "commitCells": series[-1]["supportedCells"],
                        "commitRate": series[-1]["survivalRate"]})
    return receipt


def legend(canvas, y):
    draw = ImageDraw.Draw(canvas)
    entries = [
        (E_COLOR, "current E"),
        (START_I, "START I"),
        (RETAINED, "retained I"),
        (VALID_DROPPED, "still E, dropped"),
        (INVALIDATED, "no longer E"),
        (GAINED, "newly selected"),
    ]
    x = 14
    for color, label in entries:
        draw.rectangle((x, y + 2, x + 12, y + 14), fill=color, outline=(100, 100, 100))
        draw.text((x + 17, y), label, fill=BLACK, font=SMALL)
        x += 28 + len(label) * 7


def render(data):
    assert data["grid"] == [WORLD, WORLD]
    image = Image.new("RGB", (OUT_WIDTH, OUT_HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((14, 8), "ANT | PROPOSAL UPDATE DIAGNOSTIC | P1/P2", fill=BLACK, font=FONT)
    draw.text((14, 32), "Full 96 x 96 frame; 24-cell grid lines; y-down. Maps separate environmental survival from production selection.",
              fill=BLACK, font=SMALL)
    chart = draw_survival_chart(image, data["events"])
    legend(image, 238)
    panel_receipts = []
    for row_index, event in enumerate(data["events"]):
        panels = event["panels"]
        assert len(panels) == 5
        y = 270 + row_index * PANEL_HEIGHT
        for column_index, panel in enumerate(panels):
            x = 12 + column_index * PANEL_WIDTH
            panel_receipts.append(draw_panel(image, event["id"], panel, x, y))
    return image, chart, panel_receipts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        synthetic = {
            "anchorIndex": 1, "seconds": 1.0, "timeMs": 1000, "labels": ["TEST"],
            "categories": {
                "E": [0, 1, 3], "I": [1, 3], "retained": [1],
                "stillValidButDropped": [0], "noLongerEQualified": [2],
                "newlySelected": [3],
            },
        }
        e, groups = panel_expected(synthetic)
        assert len(e) == 3
        assert groups["retained"] == {1}
        assert groups["stillValidButDropped"] == {0}
        assert groups["noLongerEQualified"] == {2}
        assert groups["newlySelected"] == {3}
        assert category_color(0, e, groups, False) == VALID_DROPPED
        assert category_color(2, e, groups, False) == INVALIDATED
        print("PASS: disjoint environmental/selection categories and fixed-grid color mapping")
        return
    raw = DATA.read_bytes().replace(b"\r\n", b"\n")
    data = json.loads(raw)
    image, chart, panels = render(data)
    receipt = {
        "inputSha256": digest(raw),
        "python": platform.python_version(),
        "pillow": PIL.__version__,
        "world": [WORLD, WORLD],
        "cellPixels": CELL,
        "imageSize": list(image.size),
        "mapping": "full 96x96 grid; cell index = y*96+x; y-down; no crop or resampling",
        "survivalChart": chart,
        "panels": panels,
        "centerCellChecks": sum(panel["cellCentersChecked"] for panel in panels),
    }
    from io import BytesIO
    stream = BytesIO()
    image.save(stream, format="PNG", optimize=False)
    image_bytes = stream.getvalue()
    receipt_text = json.dumps(receipt, indent=2) + "\n"
    if args.check:
        assert IMAGE_PATH.read_bytes() == image_bytes, "stale selection-update-atlas.png"
        assert VALIDATION_PATH.read_text(encoding="utf-8") == receipt_text, "stale atlas-validation.json"
    else:
        IMAGE_PATH.write_bytes(image_bytes)
        VALIDATION_PATH.write_text(receipt_text, encoding="utf-8", newline="\n")
    print(json.dumps({"path": IMAGE_PATH.name, "sha256": digest(image_bytes),
                      "imageSize": list(image.size), "panelCount": len(panels),
                      "centerCellChecks": receipt["centerCellChecks"]}))


if __name__ == "__main__":
    main()
