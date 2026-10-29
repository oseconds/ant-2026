from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs" / "ant" / "evidence" / "2026-10-29-p2-closure-history-audit"
DATA_PATH = BASE / "atlas-data.json"
ANALYSIS_PATH = BASE / "analysis.json"
PNG_PATH = BASE / "atlas.png"
VALIDATION_PATH = BASE / "atlas-validation.json"
CELL_PX = 14
PANEL_GAP = 22
PANEL_LEFT = 22
HEADER = 54
FOOTER = 70
COLORS = {
    "background": (243, 246, 248),
    "face": (229, 237, 242),
    "grid": (211, 219, 224),
    "E": (62, 112, 149),
    "H": (45, 55, 65),
    "boundary": (235, 145, 45),
    "E-change": (25, 141, 112),
    "H-gap": (190, 61, 67),
    "text": (35, 45, 52),
    "muted": (92, 105, 114),
}


def canonical_text(value: str) -> bytes:
    return value.replace("\r\n", "\n").encode("utf-8")


def cell_box(index: int, crop: dict, offset_x: int, offset_y: int) -> tuple[int, int, int, int]:
    x, y = index % 96, index // 96
    left = offset_x + (x - crop["x0"]) * CELL_PX
    top = offset_y + (y - crop["y0"]) * CELL_PX
    return left, top, left + CELL_PX - 1, top + CELL_PX - 1


def render() -> tuple[bytes, str]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    analysis = json.loads(ANALYSIS_PATH.read_text(encoding="utf-8"))
    crop = data["crop"]
    face = {row["index"] for row in data["faceCells"]}
    boundary = {row["index"] for row in data["boundaryCells"]}
    e_added = {row["index"] for row in data["EAddedLocal"]}
    e_removed = {row["index"] for row in data["ERemovedLocal"]}
    h_added = {row["index"] for row in data["HAddedLocal"]}
    h_removed = {row["index"] for row in data["HRemovedLocal"]}
    x_cells = crop["x1"] - crop["x0"] + 1
    y_cells = crop["y1"] - crop["y0"] + 1
    panel_w = x_cells * CELL_PX
    panel_h = y_cells * CELL_PX
    width = PANEL_LEFT * 2 + 4 * panel_w + 3 * PANEL_GAP
    height = HEADER + panel_h + FOOTER
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((PANEL_LEFT, 12), "P2 frozen face: qualified support E versus saved H representation", fill=COLORS["text"], font=font)
    draw.text((PANEL_LEFT, 29), "Same 96-grid crop and scale; orange = frozen COMMIT H boundary; no BODY fill", fill=COLORS["muted"], font=font)
    source_checks = []

    expected_order = ["E | 105.016667 s", "H | 105.016667 s", "E | 106.016667 s", "H | 106.016667 s"]
    assert [panel["label"] for panel in data["panels"]] == expected_order
    assert len(analysis["snapshots"]) == 2
    for panel_index, panel in enumerate(data["panels"]):
        x0 = PANEL_LEFT + panel_index * (panel_w + PANEL_GAP)
        y0 = HEADER
        active = set(panel["cells"])
        kind = panel["kind"]
        frame_index = 0 if panel["timeMs"] == analysis["snapshots"][0]["timeMs"] else 1
        expected = analysis["snapshots"][frame_index][kind]
        assert len(active) == expected["cells"]
        face_count = len(active & face)
        boundary_count = len(active & boundary)
        assert face_count == expected["faceCellsPresent"]
        assert boundary_count == expected["boundaryCellsPresent"]
        draw.text((x0, 39), panel["label"] + "  (" + str(len(active)) + " cells)", fill=COLORS["text"], font=font)

        checked = 0
        crop_mask_cells = 0
        for y in range(crop["y0"], crop["y1"] + 1):
            for x in range(crop["x0"], crop["x1"] + 1):
                index = y * 96 + x
                left, top, right, bottom = cell_box(index, crop, x0, y0)
                color = COLORS[kind] if index in active else COLORS["face"] if index in face else COLORS["background"]
                draw.rectangle((left, top, right, bottom), fill=color, outline=COLORS["grid"], width=1)
                center = ((left + right) // 2, (top + bottom) // 2)
                assert image.getpixel(center) == color
                checked += 1
                crop_mask_cells += int(index in active)
        source_checks.append({
            "label": panel["label"],
            "timeMs": panel["timeMs"],
            "maskCells": len(active),
            "faceCellsPresent": face_count,
            "boundaryCellsPresent": boundary_count,
            "cropMaskCells": crop_mask_cells,
            "cellCentersChecked": checked,
            "cellCentersMatched": checked,
        })

        for index in boundary:
            left, top, right, bottom = cell_box(index, crop, x0, y0)
            draw.rectangle((left + 1, top + 1, right - 1, bottom - 1), outline=COLORS["boundary"], width=2)
        if kind == "E":
            for index in e_added:
                if crop["x0"] <= index % 96 <= crop["x1"] and crop["y0"] <= index // 96 <= crop["y1"]:
                    left, top, right, bottom = cell_box(index, crop, x0, y0)
                    draw.rectangle((left + 2, top + 2, right - 2, bottom - 2), outline=COLORS["E-change"], width=2)
            for index in e_removed:
                if crop["x0"] <= index % 96 <= crop["x1"] and crop["y0"] <= index // 96 <= crop["y1"]:
                    left, top, right, bottom = cell_box(index, crop, x0, y0)
                    draw.rectangle((left + 2, top + 2, right - 2, bottom - 2), outline=COLORS["H-gap"], width=2)
        if kind == "H":
            for index in h_added:
                if crop["x0"] <= index % 96 <= crop["x1"] and crop["y0"] <= index // 96 <= crop["y1"]:
                    left, top, right, bottom = cell_box(index, crop, x0, y0)
                    if panel["timeMs"] == analysis["snapshots"][0]["timeMs"]:
                        draw.line((left + 2, top + 2, right - 2, bottom - 2), fill=COLORS["H-gap"], width=2)
                        draw.line((right - 2, top + 2, left + 2, bottom - 2), fill=COLORS["H-gap"], width=2)
                    else:
                        draw.rectangle((left + 2, top + 2, right - 2, bottom - 2), outline=COLORS["E-change"], width=2)
            for index in h_removed:
                if crop["x0"] <= index % 96 <= crop["x1"] and crop["y0"] <= index // 96 <= crop["y1"]:
                    left, top, right, bottom = cell_box(index, crop, x0, y0)
                    if panel["timeMs"] == analysis["snapshots"][0]["timeMs"]:
                        draw.rectangle((left + 2, top + 2, right - 2, bottom - 2), outline=COLORS["E-change"], width=2)
                    else:
                        draw.line((left + 2, top + 2, right - 2, bottom - 2), fill=COLORS["H-gap"], width=2)
                        draw.line((right - 2, top + 2, left + 2, bottom - 2), fill=COLORS["H-gap"], width=2)

    legend_y = HEADER + panel_h + 15
    draw.rectangle((PANEL_LEFT, legend_y, PANEL_LEFT + 13, legend_y + 13), fill=COLORS["E"])
    draw.text((PANEL_LEFT + 18, legend_y + 2), "E qualified support", fill=COLORS["text"], font=font)
    draw.rectangle((PANEL_LEFT + 175, legend_y, PANEL_LEFT + 188, legend_y + 13), fill=COLORS["H"])
    draw.text((PANEL_LEFT + 193, legend_y + 2), "H saved eligible skeleton", fill=COLORS["text"], font=font)
    draw.rectangle((PANEL_LEFT + 385, legend_y, PANEL_LEFT + 398, legend_y + 13), outline=COLORS["boundary"], width=2)
    draw.text((PANEL_LEFT + 403, legend_y + 2), "frozen face boundary", fill=COLORS["text"], font=font)
    draw.rectangle((PANEL_LEFT + 580, legend_y, PANEL_LEFT + 593, legend_y + 13), outline=COLORS["E-change"], width=2)
    draw.text((PANEL_LEFT + 598, legend_y + 2), "added cell", fill=COLORS["text"], font=font)
    draw.line((PANEL_LEFT + 755, legend_y, PANEL_LEFT + 768, legend_y + 13), fill=COLORS["H-gap"], width=2)
    draw.line((PANEL_LEFT + 768, legend_y, PANEL_LEFT + 755, legend_y + 13), fill=COLORS["H-gap"], width=2)
    draw.text((PANEL_LEFT + 773, legend_y + 2), "H boundary transition", fill=COLORS["text"], font=font)
    draw.text((PANEL_LEFT, legend_y + 24), "Face 80 cells; boundary 80 cells; crop x=37..57, y=29..55; one source cell = " + str(CELL_PX) + " px", fill=COLORS["muted"], font=font)

    import io
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    png = buffer.getvalue()
    validation = {
        "schema": "ant-p2-closure-history-atlas-validation-v1",
        "image": {
            "path": "atlas.png",
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(png).hexdigest(),
        },
        "crop": crop,
        "cellPixels": CELL_PX,
        "panels": source_checks,
        "overlays": {
            "faceCells": len(face),
            "boundaryCells": len(boundary),
            "EAddedLocalInCrop": [i for i in sorted(e_added) if crop["x0"] <= i % 96 <= crop["x1"] and crop["y0"] <= i // 96 <= crop["y1"]],
            "ERemovedLocalInCrop": [i for i in sorted(e_removed) if crop["x0"] <= i % 96 <= crop["x1"] and crop["y0"] <= i // 96 <= crop["y1"]],
            "HAddedLocalInCrop": [i for i in sorted(h_added) if crop["x0"] <= i % 96 <= crop["x1"] and crop["y0"] <= i // 96 <= crop["y1"]],
            "HRemovedLocalInCrop": [i for i in sorted(h_removed) if crop["x0"] <= i % 96 <= crop["x1"] and crop["y0"] <= i // 96 <= crop["y1"]],
            "criticalBoundaryCell": data["criticalBoundaryCell"],
        },
    }
    return png, json.dumps(validation, indent=2) + "\n"


def self_test() -> None:
    crop = {"x0": 10, "y0": 20}
    assert cell_box(20 * 96 + 10, crop, 5, 7) == (5, 7, 18, 20)
    assert cell_box(21 * 96 + 11, crop, 5, 7) == (19, 21, 32, 34)
    assert canonical_text("a\r\nb\r\n") == b"a\nb\n"
    print("PASS: source-grid cell mapping and LF-canonical text")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        png, validation_text = render()
        if "--check" in sys.argv:
            assert PNG_PATH.read_bytes() == png, "atlas.png differs"
            assert canonical_text(VALIDATION_PATH.read_text(encoding="utf-8")) == canonical_text(validation_text), "atlas-validation.json differs"
        else:
            PNG_PATH.write_bytes(png)
            VALIDATION_PATH.write_text(validation_text, encoding="utf-8", newline="\n")
        print(json.loads(validation_text)["image"])
