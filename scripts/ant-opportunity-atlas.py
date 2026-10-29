#!/usr/bin/env python3
"""Render fixed-scale descriptive maps for the opportunity-landscape audit."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-29-opportunity-landscape-audit"
DATA = PACKAGE / "data"
EXPECTED_INPUT = "e823394144b164b25de03beef3b1497442533463c120b6109338a3659a41643e"
GRID = 96
CELL = 3
MAP = GRID * CELL
WORLD_SPAN = (GRID - 1) * CELL
BG = (13, 18, 25)
TEXT = (225, 232, 240)
MUTED = (153, 168, 184)
ACCENT = (255, 201, 102)
COLORS = {"D": (255, 111, 97), "B": (93, 190, 220), "recent": (240, 199, 92)}
P1 = 84_016.66666666667
P2 = 106_016.66666666667


def read_json_gz(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def frame_at(data, t):
    return min(data["frames"], key=lambda f: abs(f["timeMs"] - t))


def cell_xy(index):
    return index % GRID, index // GRID


def world_px(value):
    return value * WORLD_SPAN + CELL / 2


def font(size=16):
    for name in ("arial.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw_frame(draw, f, ox, oy, title, winner, mode, actual_material, image):
    draw.text((ox, oy - 24), title, fill=TEXT, font=font(14))
    s = set(f["S"])
    for i in f["F"]:
        x, y = cell_xy(i)
        draw.rectangle((ox + x * CELL, oy + y * CELL, ox + (x + 1) * CELL - 1, oy + (y + 1) * CELL - 1), fill=(35, 48, 62))
    for i in s:
        x, y = cell_xy(i)
        draw.rectangle((ox + x * CELL, oy + y * CELL, ox + (x + 1) * CELL - 1, oy + (y + 1) * CELL - 1), fill=(100, 116, 130))
    # Verify every structural cell's actual raster color before overlays are drawn.
    for i in f["F"]:
        x, y = cell_xy(i)
        expected = (100, 116, 130) if i in s else (35, 48, 62)
        assert image.getpixel((ox + x * CELL + 1, oy + y * CELL + 1)) == expected
    for i in s:
        x, y = cell_xy(i)
        assert image.getpixel((ox + x * CELL + 1, oy + y * CELL + 1)) == (100, 116, 130)
    # Reference-only entry and source annulus; world coordinates map to the 96-grid.
    left, top = ox + CELL / 2, oy + CELL / 2
    right, bottom = ox + CELL / 2 + WORLD_SPAN, oy + CELL / 2 + WORLD_SPAN
    draw.rectangle((left, top, right, bottom), outline=(91, 106, 120), width=1)
    ex, ey = ox + world_px(.5), oy + world_px(.72)
    draw.ellipse((ex - 6, ey - 6, ex + 6, ey + 6), outline=ACCENT, width=2)
    r1, r2 = .055 * WORLD_SPAN, .115 * WORLD_SPAN
    draw.ellipse((ex - r2, ey - r2, ex + r2, ey + r2), outline=(182, 150, 88), width=1)
    draw.ellipse((ex - r1, ey - r1, ex + r1, ey + r1), outline=(182, 150, 88), width=1)
    if mode in ("D peaks", "B / recent"):
        channels = ("D",) if mode == "D peaks" else ("B", "recent")
        for ch in channels:
            for p in f["channels"][ch]["peaks"]:
                x, y = cell_xy(p["index"])
                x, y = (x + .5) * CELL, (y + .5) * CELL
                c = COLORS[ch]
                draw.ellipse((ox + x - 2, oy + y - 2, ox + x + 2, oy + y + 2), fill=c)
    if mode == "D centers":
        centers = f["channels"]["D"]["spacings"]["0.15"]["centers"]
        for rank, c in enumerate(centers, 1):
            ix, iy = cell_xy(c["representativeIndex"])
            x, y = (ix + .5) * CELL, (iy + .5) * CELL
            rad = max(4, 9 - min(rank, 5))
            draw.ellipse((ox + x - rad, oy + y - rad, ox + x + rad, oy + y + rad), outline=(246, 247, 250), width=1)
            if rank <= 3:
                draw.text((ox + x + rad, oy + y - 6), str(rank), fill=TEXT, font=font(10))
    if mode == "material + X" and winner and winner.get("currentMaxDIndex") is not None:
        for i in actual_material:
            x, y = cell_xy(i)
            draw.rectangle((ox + x * CELL, oy + y * CELL, ox + (x + 1) * CELL - 1, oy + (y + 1) * CELL - 1), fill=(190, 156, 111))
        prior = set(actual_material)
        for i in winner.get("xCaptureCells", []):
            x, y = cell_xy(i)
            color = (255, 223, 119) if i in prior else (228, 105, 198)
            draw.rectangle((ox + x * CELL, oy + y * CELL, ox + (x + 1) * CELL - 1, oy + (y + 1) * CELL - 1), fill=color)
        x, y = cell_xy(winner["currentMaxDIndex"])
        px, py = ox + (x + .5) * CELL, oy + (y + .5) * CELL
        # R=.15 circle is a reference guide, not the X structural window.
        rr = .15 * WORLD_SPAN
        draw.ellipse((px - rr, py - rr, px + rr, py + rr), outline=(242, 120, 211), width=2)
        draw.text((px + rr + 2, py), "R=.15", fill=(242, 120, 211), font=font(9))
        draw.rectangle((px - 3, py - 3, px + 3, py + 3), fill=(255, 255, 255))


def atlas(measurements, frozen):
    rows = [(frame_at(measurements, t), t) for t in (P1, P2)]
    winners = {round(r["timeMs"]): r for r in measurements["materialContext"]["currentMaxD"]}
    modes = ("D peaks", "D centers", "B / recent", "material + X")
    panel_w, panel_h = MAP + 22, MAP + 82
    im = Image.new("RGB", (4 * panel_w + 70, 2 * panel_h + 110), BG)
    d = ImageDraw.Draw(im)
    d.text((24, 18), "S-conditioned opportunity landscape | fixed world frame", fill=TEXT, font=font(24))
    for row, (f, target) in enumerate(rows):
        w = winners.get(round(f["timeMs"]))
        actual_material = sorted({i for b in frozen["births"] if b["timeMs"] < f["timeMs"] for i in b["cells"]})
        y = 66 + row * panel_h
        for col, mode in enumerate(modes):
            x = 25 + col * panel_w
            draw_frame(d, f, x, y, f"{f['timeMs']/1000:.3f}s · {mode}", w, mode, actual_material, im)
            if mode == "D peaks":
                info = f["channels"]["D"]
                label = f"{len(info['peaks'])} peaks · S max {info['node']['top'][0]:.4g}"
            elif mode == "D centers":
                centers = f["channels"]["D"]["spacings"]["0.15"]["centers"]
                c30 = len(f["channels"]["D"]["spacings"]["0.3"]["centers"])
                top3 = ", ".join(f"{c['value']:.3g}" for c in centers[:3])
                label = f"R=.15 {len(centers)} · R=.30 {c30} · top3 {top3}"
            elif mode == "B / recent":
                label = f"B {len(f['channels']['B']['peaks'])} peaks · recent {len(f['channels']['recent']['peaks'])} peaks"
            else:
                label = f"prior Plate tan · X window magenta · overlap yellow · winner white"
            d.text((x, y + MAP + 7), label, fill=MUTED, font=font(10))
    d.text((25, im.height - 24), "F gray, S lighter; D peaks red; white rings rank R=.15 D centers. Groups join only within F components. X uses actual capture cells; circle marks the R=.15 radius.", fill=MUTED, font=font(11))
    return im


def temporal(measurements):
    W, H = 1500, 1080
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((30, 20), "Opportunity landscape over time | descriptive summaries", fill=TEXT, font=font(24))
    frames = measurements["frames"]
    ts = [f["timeMs"] / 1000 for f in frames]
    x0, x1 = 90, W - 55
    plot_top, plot_bottom = 90, 340
    def xpos(t): return x0 + (x1 - x0) * t / 120
    def line(series, color, ymax, ytop, ybottom, width=2):
        pts = [(xpos(t), ybottom - (v / ymax) * (ybottom - ytop)) for t, v in series if v is not None]
        # Break lines at empty/undefined frames; never interpolate missing observations.
        segment = []
        last_i = None
        for i, (t, v) in enumerate(series):
            if v is None:
                if len(segment) > 1: d.line(segment, fill=color, width=width)
                segment, last_i = [], None
                continue
            p = (xpos(t), ybottom - (v / ymax) * (ybottom - ytop))
            if last_i is not None and i == last_i + 1: segment.append(p)
            else:
                if len(segment) > 1: d.line(segment, fill=color, width=width)
                segment = [p]
            last_i = i
        if len(segment) > 1: d.line(segment, fill=color, width=width)
    peak_ymax = max(10, math.ceil(max(len(f["channels"][ch]["peaks"]) for f in frames for ch in COLORS) / 10) * 10)
    for y in range(0, 5):
        yy = plot_bottom - y * (plot_bottom - plot_top) / 4
        d.line((x0, yy, x1, yy), fill=(44, 56, 68))
        d.text((35, yy - 8), str(round(y * peak_ymax / 4)), fill=MUTED, font=font(12))
    for ch, color in COLORS.items():
        line([(t, len(f["channels"][ch]["peaks"]) if f["S"] else None) for t, f in zip(ts, frames)], color, peak_ymax, plot_top, plot_bottom)
    d.text((90, 62), f"S-conditioned raw peak counts (D red, B blue, recent gold; y scale 0–{peak_ymax})", fill=MUTED, font=font(14))
    ytop, ybottom = 470, 610
    for y in range(0, 5):
        yy = ybottom - y * (ybottom - ytop) / 4
        d.line((x0, yy, x1, yy), fill=(44, 56, 68))
        d.text((44, yy - 8), f"{y/4:.2f}", fill=MUTED, font=font(12))
    for ch, color in COLORS.items():
        distances = []
        for t, f in zip(ts, frames):
            centers = f["channels"][ch]["spacings"]["0.15"]["centers"]
            distances.append((t, centers[0]["distances"]["entry"] if centers else None))
        line(distances, color, 1, ytop, ybottom)
    d.text((90, 445), "Entry distance of each channel's current S-conditioned winner (world units; gaps when absent)", fill=MUTED, font=font(13))
    ytop, ybottom = 680, 800
    for y in range(0, 5):
        yy = ybottom - y * (ybottom - ytop) / 4
        d.line((x0, yy, x1, yy), fill=(44, 56, 68))
        d.text((44, yy - 8), f"{y/4:.2f}", fill=MUTED, font=font(12))
    # For D, B and recent: top2/top1 in spaced centers. Undefined single-center frames remain gaps.
    for ch, color in COLORS.items():
        ratios = []
        for t, f in zip(ts, frames):
            centers = f["channels"][ch]["spacings"]["0.15"]["centers"]
            v = centers[1]["value"] / centers[0]["value"] if len(centers) > 1 and centers[0]["value"] else None
            ratios.append((t, v))
        line(ratios, color, 1, ytop, ybottom)
    d.text((90, 650), "Spaced top2/top1 ratio at R=.15 (gaps retained)", fill=MUTED, font=font(13))
    # D .15 primary .025 correspondence tracks; rank 1 observations are explicit.
    spans = []
    for tr in measurements["temporalTracks"]:
        if tr.get("channel") == "D" and tr.get("spacingRadius") == .15 and tr.get("maxDisplacement") == .025:
            for track in tr.get("tracks", []):
                obs = track.get("observations", [])
                if obs:
                    spans.append((track.get("observedSpanMs", 0), obs[0]["timeMs"] / 1000, obs[-1]["timeMs"] / 1000, track["id"], obs))
    spans.sort(key=lambda x: (-x[0], x[3]))
    d.text((90, 370), "Primary D correspondence spans (R=.15, displacement≤.025; top 8 by observed span; dots mark rank 1)", fill=MUTED, font=font(13))
    if spans:
        assert round(spans[0][0] / 1000) == 82
    for i, (span_ms, a, b, ident, obs) in enumerate(spans[:8]):
        yy = 392 + i * 4
        xA, xB = xpos(a), xpos(b)
        d.line((xA, yy, xB, yy), fill=(196, 145 + i * 8, 220), width=2)
        for o in obs:
            if o.get("rank") == 1:
                xx = xpos(o["timeMs"] / 1000)
                d.ellipse((xx - 2, yy - 2, xx + 2, yy + 2), fill=(255, 236, 250))
    for t in range(0, 121, 20):
        xx = xpos(t)
        d.line((xx, plot_bottom + 3, xx, plot_bottom + 8), fill=MUTED)
        d.text((xx - 10, plot_bottom + 10), str(t), fill=MUTED, font=font(12))
    # Separate D spaced-center cardinality from raw peak count and strength ratio.
    ytop, ybottom = 920, 1040
    d.text((90, 885), "D spaced-center counts (R=.15 red, R=.30 blue)", fill=MUTED, font=font(13))
    count_max = max(10, math.ceil(max(len(f["channels"]["D"]["spacings"][r]["centers"]) for f in frames for r in ("0.15", "0.3")) / 10) * 10)
    for y in range(5):
        yy = ybottom - y * (ybottom - ytop) / 4
        d.line((x0, yy, x1, yy), fill=(44, 56, 68))
        d.text((48, yy - 8), str(round(y * count_max / 4)), fill=MUTED, font=font(12))
    for radius, color in (("0.15", COLORS["D"]), ("0.3", COLORS["B"])):
        line([(t, len(f["channels"]["D"]["spacings"][radius]["centers"]) if f["S"] else None) for t, f in zip(ts, frames)], color, count_max, ytop, ybottom)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="render in memory and verify existing PNG bytes without overwriting")
    args = ap.parse_args()
    measurements = read_json_gz(DATA / "measurements.json.gz")
    frozen = read_json_gz(DATA / "frozen-input.json.gz")
    if measurements["inputSha256"] != EXPECTED_INPUT or frozen["main"] != measurements["sourceCommit"]:
        raise SystemExit("input SHA pin mismatch")
    if len(measurements["frames"]) != 120 or len(frozen["frames"]) != 120:
        raise SystemExit("expected 120 sampled frames")
    # Assert grid-coordinate mapping against source arrays at both selected snapshots.
    for t in (P1, P2):
        f = frame_at(measurements, t)
        raw = frame_at(frozen, t)
        if abs(f["timeMs"] - t) > 1e-5 or f["S"] != raw["S"] or f["F"] != raw["F"]:
            raise SystemExit("selected frame does not match frozen source coordinates")
        if f["globalMaxima"]["D"]["inS"] and f["globalMaxima"]["D"]["index"] != max(f["channels"]["D"]["peaks"], key=lambda p: p["value"])["index"]:
            raise SystemExit("D peak/source winner mismatch")
        material = min(measurements["materialContext"]["currentMaxD"], key=lambda r: abs(r["timeMs"] - f["timeMs"]))
        top = max(f["channels"]["D"]["peaks"], key=lambda p: p["value"])
        if material["currentMaxDIndex"] != top["index"] or abs(material["value"] - top["value"]) > 1e-12:
            raise SystemExit("material-context winner does not match S-conditioned D peak")
        center_top = f["channels"]["D"]["spacings"]["0.15"]["centers"][0]
        if abs(f["channels"]["D"]["node"]["top"][0] - top["value"]) > 1e-12 or center_top["representativeIndex"] != top["index"] or abs(center_top["value"] - top["value"]) > 1e-12:
            raise SystemExit("D node maximum does not match S-conditioned peak maximum")
        actual_prior = {i for b in frozen["births"] if b["timeMs"] < f["timeMs"] for i in b["cells"]}
        if material["xCaptureCellCount"] != len(material["xCaptureCells"]):
            raise SystemExit("X capture count does not match actual source cells")
        if material["preexistingMaterialCells"] != len(actual_prior):
            raise SystemExit("pre-existing material count does not match earlier frozen births")
        if set(material["preexistingXMaterialCells"]) != (set(material["xCaptureCells"]) & actual_prior):
            raise SystemExit("actual X/material overlap does not match source cells")
    images = {"atlas.png": atlas(measurements, frozen), "temporal.png": temporal(measurements)}
    if args.check:
        for name, image in images.items():
            path = PACKAGE / name
            import io
            buf = io.BytesIO()
            image.save(buf, format="PNG", optimize=False)
            if not path.exists() or hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(buf.getvalue()).digest():
                raise SystemExit(f"deterministic PNG mismatch: {name}")
        print("deterministic PNG byte checks passed")
    else:
        for name, image in images.items():
            image.save(PACKAGE / name, format="PNG", optimize=False)
            print(f"wrote {PACKAGE / name}")


if __name__ == "__main__":
    main()
