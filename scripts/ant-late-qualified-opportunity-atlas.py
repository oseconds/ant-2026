#!/usr/bin/env python3
"""Render fixed-frame late opportunity and temporal context maps."""
import gzip
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture"
DATA = PACKAGE / "data"
GRID = 96
CELL = 4
MAP = GRID * CELL
PANEL_W = MAP + 28
PANEL_H = MAP + 96
BG = (14, 19, 26)
PANEL_BG = (19, 26, 34)
TEXT = (226, 233, 240)
MUTED = (157, 171, 185)
COLORS = {"D": (248, 110, 100), "B": (83, 198, 227), "C": (112, 210, 150), "recent": (247, 203, 87)}
ENTRY = (0.5, 0.72)


def read_gzip(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def font(size=13):
    for name in ("arial.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def xy(index):
    return index % GRID, index // GRID


def cell_center(index):
    x, y = xy(index)
    return x * CELL + CELL // 2, y * CELL + CELL // 2


def world_point(x, y):
    return int(round(x * (GRID - 1) * CELL + CELL / 2)), int(round(y * (GRID - 1) * CELL + CELL / 2))


def ramp(value, maximum, low, high):
    t = 0.0 if maximum <= 0 else max(0.0, min(1.0, value / maximum))
    return tuple(round(a + (b - a) * t) for a, b in zip(low, high))


def base_map(values, maximum, low, high):
    im = Image.new("RGB", (MAP, MAP), BG)
    px = im.load()
    for index, value in enumerate(values):
        x, y = xy(index)
        color = ramp(value, maximum, low, high)
        for dy in range(CELL):
            for dx in range(CELL):
                px[x * CELL + dx, y * CELL + dy] = color
    return im


def overlay_structure(im, frame, outline=(87, 166, 188)):
    draw = ImageDraw.Draw(im)
    E = set(frame["E"])
    F = set(frame["F"])
    S = set(frame["S"])
    for i in E:
        x, y = xy(i)
        adjacent_outside = (x == 0 or y == 0 or x == GRID - 1 or y == GRID - 1
                            or (i - GRID not in E) or (i + GRID not in E)
                            or (i % GRID > 0 and i - 1 not in E)
                            or (i % GRID < GRID - 1 and i + 1 not in E))
        if adjacent_outside:
            draw.rectangle((x * CELL, y * CELL, x * CELL + CELL - 1, y * CELL + CELL - 1), outline=outline)
    for i in F:
        cx, cy = cell_center(i)
        draw.rectangle((cx - 1, cy - 1, cx + 1, cy + 1), fill=(172, 186, 198))
    for i in S:
        cx, cy = cell_center(i)
        draw.rectangle((cx, cy, cx, cy), fill=(247, 247, 244))


def reference_overlay(im):
    draw = ImageDraw.Draw(im)
    ex, ey = world_point(*ENTRY)
    for radius, color in ((0.115, (112, 121, 128)), (0.055, (112, 121, 128))):
        r = radius * (GRID - 1) * CELL
        draw.ellipse((ex - r, ey - r, ex + r, ey + r), outline=color, width=1)
    draw.ellipse((ex - 4, ey - 4, ex + 4, ey + 4), fill=(255, 224, 123), outline=(20, 20, 20), width=1)


def plot_centers(im, centers, color, labels=True, radius=4):
    draw = ImageDraw.Draw(im)
    for row in centers:
        x, y = cell_center(row["representativeIndex"])
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=color, width=2)
        if labels and row["rank"] <= 3:
            draw.text((x + radius + 1, y - 9), str(row["rank"]), fill=color, font=font(10))


def chart_axes(draw, x0, x1, top, bottom, ticks, maximum, label_color=MUTED):
    for value, label in ticks:
        y = bottom - value / maximum * (bottom - top)
        draw.line((x0, y, x1, y), fill=(37, 47, 57), width=1)
        draw.text((x0 - 38, y - 6), label, fill=label_color, font=font(9))
    for index, label in ((0, "1"), (9, "10"), (19, "20")):
        x = x0 + index * (x1 - x0) / 19
        draw.text((x - 5, bottom + 1), label, fill=label_color, font=font(8))


def build_atlas(inputs, measurements):
    selected = []
    for window in ("300s", "600s"):
        row = measurements["windows"][window]["frames"][-1]
        original = next(frame for frame in inputs["frames"] if frame["timeMs"] == row["timeMs"])
        selected.append((window, original, row))
    canvas = Image.new("RGB", (5 * PANEL_W + 70, 2 * PANEL_H + 142), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((28, 18), "Qualified opportunity landscape | same 96×96 world frame", fill=TEXT, font=font(24))
    draw.text((28, 49), "Last actual analysis anchor before each saved checkpoint; overlays are descriptive references.",
              fill=MUTED, font=font(13))
    titles = ["B memory + E/F/S", "D sampled support", "D peaks + spaced centers",
              ".15 centers by channel", "Actual prior material + X"]
    for row_index, (window, frame, analyzed) in enumerate(selected):
        panel_y = 112 + row_index * PANEL_H
        dcenters = analyzed["channels"]["D"]["spacings"]["0.15"]["centers"]
        bcenters = analyzed["channels"]["B"]["spacings"]["0.15"]["centers"]
        ccenters = analyzed["channels"]["C"]["spacings"]["0.15"]["centers"]
        rcenters = analyzed["channels"]["recent"]["spacings"]["0.15"]["centers"]
        maps = []

        bmap = base_map(frame["B"], 1.0, (12, 20, 28), (65, 172, 201))
        overlay_structure(bmap, frame, (104, 194, 213))
        reference_overlay(bmap)
        maps.append(bmap)

        dmap = base_map(frame["D"], 1.0, (18, 22, 28), (223, 101, 79))
        overlay_structure(dmap, frame, (239, 202, 116))
        reference_overlay(dmap)
        maps.append(dmap)

        peakmap = Image.new("RGB", (MAP, MAP), (25, 31, 39))
        pdraw = ImageDraw.Draw(peakmap)
        for i in frame["S"]:
            x, y = cell_center(i)
            pdraw.point((x, y), fill=(88, 101, 112))
        for peak in analyzed["channels"]["D"]["peaks"]:
            x, y = cell_center(peak["index"])
            pdraw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(234, 122, 105))
        plot_centers(peakmap, dcenters, (250, 247, 237), labels=True, radius=5)
        reference_overlay(peakmap)
        maps.append(peakmap)

        center_map = base_map(frame["C"], 1.0, (17, 24, 26), (87, 161, 113))
        overlay_structure(center_map, frame, (191, 205, 170))
        pdraw = ImageDraw.Draw(center_map)
        for centers, color in ((dcenters, COLORS["D"]), (bcenters, COLORS["B"]),
                               (ccenters, COLORS["C"]), (rcenters, COLORS["recent"])):
            plot_centers(center_map, centers[:3], color, labels=False, radius=5)
        reference_overlay(center_map)
        maps.append(center_map)

        existing = frame["preMaterialLayers"]
        material_map = Image.new("RGB", (MAP, MAP), (25, 31, 39))
        px = material_map.load()
        for i, count in enumerate(existing):
            if count:
                x, y = xy(i)
                tone = min(4, count)
                color = (119 + 16 * tone, 88 + 12 * tone, 61 + 8 * tone)
                for dy in range(CELL):
                    for dx in range(CELL):
                        px[x * CELL + dx, y * CELL + dy] = color
        for i in analyzed["material"]["Xcells"]:
            x, y = xy(i)
            color = (255, 199, 105) if existing[i] else (209, 103, 196)
            for dy in range(CELL):
                for dx in range(CELL):
                    px[x * CELL + dx, y * CELL + dy] = color
        plot_centers(material_map, dcenters[:3], (231, 246, 255), labels=True, radius=5)
        reference_overlay(material_map)
        maps.append(material_map)

        subtitles = [
            f"B fixed 0–1; blue outline E; gray F / white S · {len(frame['E'])}/{len(frame['F'])}/{len(frame['S'])} cells",
            "D derived from SurfaceField C; fixed 0–1 scale; E outline and F/S points",
            f"All {len(analyzed['channels']['D']['peaks'])} D peaks; white rings are .15 centers",
            "C fixed 0–1 context; rank 1–3: D red, B cyan, C green, recent gold",
            f"Brown depth 1–4+; X magenta/virgin and gold/overlap · overlap {analyzed['material']['XpreexistingMaterialFraction']:.3f}",
        ]
        for col, image in enumerate(maps):
            ox = 26 + col * PANEL_W
            draw.text((ox, panel_y - 43), f"{window} · {titles[col]}", fill=TEXT, font=font(14))
            draw.text((ox, panel_y - 22), subtitles[col], fill=MUTED, font=font(10))
            canvas.paste(image, (ox, panel_y))
        draw.text((26, panel_y + MAP + 8),
                  f"model {analyzed['timeMs'] / 1000:.6f}s · D .15 centers {len(dcenters)} · "
                  f"D top2/top1 {analyzed['channels']['D']['spacings']['0.15']['top']['top2ToTop1']:.3f} · "
                  f"prior Plates {analyzed['material']['preexistingPlateCount']}", fill=TEXT, font=font(12))
    footer_y = canvas.height - 35
    draw.text((26, footer_y),
              "B/C/D use fixed 0–1 scales across both windows; no per-window gain normalization. "
              "Entry marker is reference-only.", fill=MUTED, font=font(11))
    canvas.save(PACKAGE / "opportunity-atlas.png")
    return True


def build_temporal(measurements):
    width, height = 1700, 1100
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((28, 18), "Late opportunity hierarchy | two independent 20-anchor windows", fill=TEXT, font=font(23))
    tracks = measurements["temporalTracks"]
    colors = COLORS
    plot_left, plot_right = 90, 810
    for window_index, window in enumerate(("300s", "600s")):
        x0 = plot_left + window_index * 820
        x1 = plot_right + window_index * 820
        rows = measurements["windows"][window]["frames"]
        y_base = 70
        draw.text((x0, y_base), f"{window} · exact anchors {rows[0]['timeMs']/1000:.6f}–{rows[-1]['timeMs']/1000:.6f}s",
                  fill=TEXT, font=font(14))
        # Separated .15 center count.
        top, bottom = y_base + 34, y_base + 175
        draw.text((x0, top - 17), ".15 separated-center count", fill=MUTED, font=font(12))
        ymax = 55
        chart_axes(draw, x0, x1, top, bottom, ((0, "0"), (25, "25"), (50, "50")), ymax)
        for channel in ("D", "B", "C", "recent"):
            vals = [len(frame["channels"][channel]["spacings"]["0.15"]["centers"]) for frame in rows]
            pts = [(x0 + i * (x1 - x0) / 19, bottom - value / ymax * (bottom - top)) for i, value in enumerate(vals)]
            draw.line(pts, fill=colors[channel], width=2)
            for px, py in pts:
                draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=colors[channel])
        draw.text((x0, bottom + 7), "D red · B cyan · C green · recent gold", fill=MUTED, font=font(10))

        # S-conditioned top2/top1 ratios, without a pass/fail line.
        top, bottom = y_base + 235, y_base + 365
        draw.text((x0, top - 17), ".15 separated top2/top1 strength ratio", fill=MUTED, font=font(12))
        chart_axes(draw, x0, x1, top, bottom, ((0, "0"), (0.5, ".5"), (1, "1")), 1)
        for channel in ("D", "B", "C", "recent"):
            vals = [frame["channels"][channel]["spacings"]["0.15"]["top"]["top2ToTop1"] for frame in rows]
            pts = [(x0 + i * (x1 - x0) / 19, bottom - value * (bottom - top)) for i, value in enumerate(vals)]
            draw.line(pts, fill=colors[channel], width=2)
            for px, py in pts:
                draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=colors[channel])

        # Entry distance of S-conditioned winners.
        top, bottom = y_base + 425, y_base + 555
        draw.text((x0, top - 17), ".15 winner distance from entry (world units; 0–.15 range)", fill=MUTED, font=font(12))
        chart_axes(draw, x0, x1, top, bottom, ((0, "0"), (0.075, ".075"), (0.15, ".15")), 0.15)
        for channel in ("D", "B", "C", "recent"):
            vals = [frame["channels"][channel]["spacings"]["0.15"]["topWinnerEntryDistance"] for frame in rows]
            pts = [(x0 + i * (x1 - x0) / 19, bottom - min(0.15, value) / 0.15 * (bottom - top)) for i, value in enumerate(vals)]
            draw.line(pts, fill=colors[channel], width=2)
            for px, py in pts:
                draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=colors[channel])

        # D .15 correspondence families; IDs are local descriptive match labels.
        track = next(row for row in tracks if row["channel"] == "D" and row["spacingRadius"] == 0.15
                     and row["maxDisplacement"] == 0.025 and row["winnerHistory"][0]["timeMs"] == rows[0]["timeMs"])
        top, bottom = y_base + 640, y_base + 1020
        draw.text((x0, top - 20), "D .15 family IDs by anchor · ≤.025 world displacement", fill=MUTED, font=font(12))
        max_id = max(1, max(row["id"] for row in track["tracks"]))
        for family_id in sorted({0, max_id // 2, max_id}):
            y = bottom - family_id / max_id * (bottom - top)
            draw.line((x0, y, x1, y), fill=(37, 47, 57), width=1)
            draw.text((x0 - 30, y - 6), str(family_id), fill=MUTED, font=font(8))
        for family in track["tracks"]:
            obs = family["observations"]
            if not obs:
                continue
            ys = bottom - family["id"] / max_id * (bottom - top)
            pts = [(x0 + i * (x1 - x0) / 19, ys) for i, frame in enumerate(rows)
                   if any(item["timeMs"] == frame["timeMs"] for item in obs)]
            ranks = {item["rank"] for item in obs}
            color = (248, 110, 100) if 1 in ranks else (99, 183, 220) if 2 in ranks else (72, 82, 91)
            if len(pts) > 1:
                draw.line(pts, fill=color, width=1)
            for px, py in pts:
                draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=color)
        draw.text((x0, bottom + 7), "Rank-1 family red; families ever rank 2 cyan; other matched centers gray. "
                  "Family IDs restart in the other window.", fill=MUTED, font=font(10))
    canvas.save(PACKAGE / "temporal-atlas.png")


inputs = read_gzip(DATA / "late-input.json.gz")
measurements = read_gzip(DATA / "measurements.json.gz")
build_atlas(inputs, measurements)
build_temporal(measurements)
print(json.dumps({"opportunityAtlas": str(PACKAGE / "opportunity-atlas.png"),
                  "temporalAtlas": str(PACKAGE / "temporal-atlas.png"),
                  "lastAnchorStates": [row["frames"][-1]["timeMs"] for row in measurements["windows"].values()]}))
