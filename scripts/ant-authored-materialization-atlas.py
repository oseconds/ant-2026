#!/usr/bin/env python3
"""Render deterministic same-frame maps for authored materialization candidates."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis"
INPUT = ROOT / "docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz"
ANALYSIS = PACKAGE / "analysis.json"
OUTPUT = PACKAGE / "atlas.png"
SIZE = 96
CELL = 4
MARGIN = 24
TOP = 53
GAP_X = 20
GAP_Y = 30
PANEL_W = SIZE * CELL
PANEL_H = SIZE * CELL
COLORS = {"I": (35, 35, 35), "G": (35, 92, 150), "X": (164, 79, 42), "L": (112, 72, 139)}
NUCLEUS = (18, 150, 85)
GUIDE = (170, 185, 176)


def load_data():
    digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    if digest != "6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d":
        raise ValueError(f"unexpected frozen input SHA-256: {digest}")
    with gzip.open(INPUT, "rt", encoding="utf-8") as f:
        frozen = json.load(f)
    analysis = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    return {e["id"]: e for e in frozen["events"]}, {e["id"]: e for e in analysis["events"]}


def rect(draw, ox, oy, index, color):
    x, y = index % SIZE, index // SIZE
    x0, y0 = ox + x * CELL, oy + y * CELL
    draw.rectangle((x0, y0, x0 + CELL - 1, y0 + CELL - 1), fill=color)


def draw_cells(draw, ox, oy, indices, color):
    for index in indices:
        rect(draw, ox, oy, index, color)


def render():
    frozen, analysis = load_data()
    labels = ("E / F context", "I production", "G graph packet", "X Euclidean packet", "L limb")
    width = MARGIN * 2 + len(labels) * PANEL_W + (len(labels) - 1) * GAP_X
    height = TOP + 2 * PANEL_H + GAP_Y + 32
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    for col, label in enumerate(labels):
        ox = MARGIN + col * (PANEL_W + GAP_X)
        draw.text((ox, 25), label, fill=(35, 35, 35), font=font)

    pixel_checks = []
    for row, event_id in enumerate((1, 2)):
        source = frozen[event_id]["anchors"][-1]
        frame = analysis[event_id]["anchors"][-1]
        maps = source["maps"]
        y = TOP + row * (PANEL_H + GAP_Y)
        draw.text((MARGIN + 82, y - 16), f"P{row + 1}  {source['timeMs'] / 1000:.6f} s", fill=(25, 25, 25), font=font)
        for col in range(len(labels)):
            ox = MARGIN + col * (PANEL_W + GAP_X)
            draw.rectangle((ox, y, ox + PANEL_W - 1, y + PANEL_H - 1), outline=(225, 225, 225))

        ox = MARGIN
        center_x = ox + (frame["nucleus"]["point"][0] * (SIZE - 1)) * CELL + CELL // 2
        center_y = y + (frame["nucleus"]["point"][1] * (SIZE - 1)) * CELL + CELL // 2
        radius = 0.15 * (SIZE - 1) * CELL
        draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline=GUIDE, width=1)
        draw_cells(draw, ox, y, [i for i, value in enumerate(maps["E_qualified"]) if value], (225, 226, 226))
        draw_cells(draw, ox, y, [i for i, value in enumerate(maps["F_skeleton"]) if value], (167, 174, 177))

        nucleus = frame["nucleus"]
        radius = 0.15 * (SIZE - 1) * CELL
        for col, name in enumerate(("I", "G", "X", "L"), start=1):
            ox = MARGIN + col * (PANEL_W + GAP_X)
            center_x = ox + (nucleus["point"][0] * (SIZE - 1)) * CELL + CELL // 2
            center_y = y + (nucleus["point"][1] * (SIZE - 1)) * CELL + CELL // 2
            draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline=GUIDE, width=1)
            cells = ([i for i, value in enumerate(maps["I_retained_network"]) if value]
                     if name == "I" else frame["candidates"][name]["cells"])
            color = COLORS[name]
            draw_cells(draw, ox, y, cells, color)
            nodes = frame["productionINodes"] if name == "I" else frame["candidates"][name]["nodes"]
            draw.text((ox + 4, y + 4), f"{nodes} nodes", fill=(40, 40, 40), font=font)
            pixel_checks.append((name, ox, y, cells, color))

        # The circle is an authored R=0.15 spatial guide, not candidate material.
        # Check actual candidate/control raster centers before the nucleus is drawn.
        for name, ox, oy, cells, color in pixel_checks[-4:]:
            for index in cells:
                pixel = (ox + (index % SIZE) * CELL + CELL // 2,
                         oy + (index // SIZE) * CELL + CELL // 2)
                if image.getpixel(pixel) != color:
                    raise AssertionError(f"{name} cell {index} pre-marker pixel mismatch")
        # Draw the same max-D nucleus in each panel; the RGB marker itself is excluded from cell checks.
        for col in range(len(labels)):
            ox = MARGIN + col * (PANEL_W + GAP_X)
            center_x = ox + (nucleus["point"][0] * (SIZE - 1)) * CELL + CELL // 2
            cy = y + (nucleus["point"][1] * (SIZE - 1)) * CELL + CELL // 2
            draw.ellipse((center_x - 3, cy - 3, center_x + 3, cy + 3), fill=NUCLEUS)
        for name, ox, oy, cells, color in pixel_checks[-4:]:
            for index in cells:
                pixel = (ox + (index % SIZE) * CELL + CELL // 2,
                         oy + (index // SIZE) * CELL + CELL // 2)
                if index != nucleus["index"] and image.getpixel(pixel) != color:
                    raise AssertionError(f"{name} cell {index} post-marker pixel mismatch")
            marker_pixel = (ox + (nucleus["index"] % SIZE) * CELL + CELL // 2,
                            oy + (nucleus["index"] // SIZE) * CELL + CELL // 2)
            if image.getpixel(marker_pixel) != NUCLEUS:
                raise AssertionError(f"{name} nucleus marker pixel mismatch")

    draw.text((MARGIN, height - 20),
              "Same 96 x 96 world coordinates and scale. Thin circle: authored R=0.15 guide, not material. Nucleus: max D.",
              fill=(65, 65, 65), font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    return image, buffer.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="require generated bytes to match existing atlas.png")
    args = parser.parse_args()
    previous = OUTPUT.read_bytes() if args.check else None
    image, generated = render()
    if args.check and generated != previous:
        raise SystemExit("atlas.png differs from deterministic render")
    if not args.check:
        OUTPUT.write_bytes(generated)
    print(f"atlas: {image.width}x{image.height} px; {len(generated)} bytes; candidate/control raster assertions passed")
    if args.check:
        print("--check: generated bytes match existing atlas.png")


if __name__ == "__main__":
    main()
