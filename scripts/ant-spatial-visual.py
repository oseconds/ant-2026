#!/usr/bin/env python3
"""Render fixed-view, offline spatial diagnostics from completed ANT result.json files."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE = ROOT / "docs/ant/evidence/2026-10-22-spatial-dynamics"
DEFAULT_OUT = DEFAULT_EVIDENCE / "visual"
CHECKPOINTS = (300, 600, 1200, 1800, 3600, 7200)
TRACE_CHECKPOINTS = (600, 1800, 7200)
PANEL = 400
PAD = 34
LABEL_H = 32
TITLE_H = 54
ROWS = (("production", DEFAULT_EVIDENCE / "long-run/production-20261005/result.json"),
        ("dtFeedback", DEFAULT_EVIDENCE / "long-run/dtFeedback-20261005/result.json"))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_run(label, path):
    with path.open("r", encoding="utf-8") as source:
        result = json.load(source)
    assert result["schemaVersion"] == 1 and result["seed"] == 20261005
    assert result["seconds"] == 7200 and len(result["checkpoints"]) >= 8
    checkpoints = {row["second"]: row["publicSnapshot"] for row in result["checkpoints"]}
    assert set(CHECKPOINTS).issubset(checkpoints)
    data = {"label": label, "checkpoints": {}, "traces": {}, "input": path, "inputSha256": sha256(path),
            "resultSourceHashes": result["sourceHashes"], "seconds": result["modelSeconds"]}
    for second in CHECKPOINTS:
        snap = checkpoints[second]
        field = snap["pheromone"]
        assert (field["width"], field["height"], len(field["values"])) == (96, 96, 96 * 96)
        agents = snap["agents"]
        plates = snap["surfacePlates"]["plates"]
        assert all(0 <= agent["x"] <= 1 and 0 <= agent["y"] <= 1 for agent in agents)
        for plate in plates:
            assert len(plate["mask"]) == 96 * 96 and plate["grid"]["width"] == 96
            assert all(0 <= index < 96 * 96 for index in plate["principalPath"])
        data["checkpoints"][second] = {
            "pheromone": field["values"], "agents": [(a["x"], a["y"], a["heading"]) for a in agents],
            "plateCount": len(plates), "union": bytearray(96 * 96),
            "routes": [(p["bornAtSimulationTimeMs"] / 1000, p["principalPath"], p["centerline"])
                       for p in plates],
        }
        union = data["checkpoints"][second]["union"]
        for plate in plates:
            for index, occupied in enumerate(plate["mask"]):
                if occupied:
                    union[index] = 1
    frames = result["trajectory10Hz"]
    assert len(frames) == 72000 and frames[0]["tick"] == 6 and frames[-1]["tick"] == 432000
    assert all(frame["tick"] == (index + 1) * 6 for index, frame in enumerate(frames))
    by_tick = {frame["tick"]: frame["agents"] for frame in frames}
    assert len(by_tick) == len(frames)
    for second in TRACE_CHECKPOINTS:
        first_tick, last_tick = (second - 120) * 60, second * 60
        assert first_tick > 0 and last_tick in by_tick
        data["traces"][second] = [
            (tick, agents) for tick, agents in by_tick.items() if first_tick < tick <= last_tick
        ]
    del result
    return data


def fixed_font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


FONT = fixed_font(16)
SMALL = fixed_font(13)
TITLE = fixed_font(23)


def panel_xy(x, y, origin):
    return origin[0] + PAD + x * PANEL, origin[1] + TITLE_H + LABEL_H + y * PANEL


def draw_ants(draw, agents, origin):
    for x, y, heading in agents:
        x0, y0 = panel_xy(x, y, origin)
        x1 = x0 + math.cos(heading) * 9
        y1 = y0 + math.sin(heading) * 9
        draw.ellipse((x0 - 3, y0 - 3, x0 + 3, y0 + 3), fill=(20, 20, 20))
        draw.line((x0, y0, x1, y1), fill=(20, 20, 20), width=2)
        draw.polygon([(x1, y1), (x1 - math.cos(heading - .5) * 4, y1 - math.sin(heading - .5) * 4),
                      (x1 - math.cos(heading + .5) * 4, y1 - math.sin(heading + .5) * 4)], fill=(20, 20, 20))


def make_sheet(title, runs, output, mode):
    w = 2 * PAD + len(CHECKPOINTS) * PANEL + (len(CHECKPOINTS) - 1) * 16
    h = TITLE_H + 2 * (LABEL_H + PANEL + 22)
    image = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(image)
    draw.text((PAD, 12), title, fill=(20, 20, 20), font=TITLE)
    for row, run in enumerate(runs):
        for col, second in enumerate(CHECKPOINTS):
            item = run["checkpoints"][second]
            ox = PAD + col * (PANEL + 16)
            oy = TITLE_H + row * (LABEL_H + PANEL + 22)
            draw.text((ox, oy), f"{run['label']} · {second:,} model s", fill=(30, 30, 30), font=FONT)
            box = (ox + PAD, oy + LABEL_H, ox + PAD + PANEL, oy + LABEL_H + PANEL)
            draw.rectangle(box, fill="white", outline=(145, 145, 145), width=1)
            if mode == "field":
                grid = Image.new("RGB", (96, 96), "white")
                px = grid.load()
                for index, value in enumerate(item["pheromone"]):
                    # Same fixed two-scale alpha transfer used by AntRenderer; no panel rescaling.
                    base = smoothstep(0.004, 0.050, value)
                    route = smoothstep(0.040, 0.180, value)
                    alpha = min(112, round(base * 22 + route * 90))
                    shade = round(255 - alpha)
                    px[index % 96, index // 96] = (shade, shade, shade)
                grid = grid.resize((PANEL, PANEL), Image.Resampling.NEAREST)
                image.paste(grid, (box[0], box[1]))
                draw_ants(draw, item["agents"], (ox, oy))
            elif mode == "ants":
                draw_ants(draw, item["agents"], (ox, oy))
            elif mode == "material":
                mask = Image.new("L", (96, 96), 0)
                mask.putdata([255 if value else 0 for value in item["union"]])
                image.paste(Image.new("RGB", (PANEL, PANEL), (88, 88, 88)),
                            (box[0], box[1]), mask.resize((PANEL, PANEL), Image.Resampling.NEAREST))
                draw.text((box[0] + 8, box[1] + 8), f"union cells: {sum(item['union']):,}",
                          fill=(20, 20, 20), font=SMALL, stroke_width=1, stroke_fill="white")
            elif mode == "routes":
                for born, indices, centerline in item["routes"]:
                    # Fixed chronological birth cohort palette; diagnostic only, not renderer color.
                    cohort = min(5, max(0, int(born // 1200)))
                    color = ((31, 119, 180), (255, 127, 14), (44, 160, 44),
                             (214, 39, 40), (148, 103, 189), (80, 80, 80))[cohort]
                    by_index = {point["index"]: point for point in centerline}
                    points = [by_index.get(index) for index in indices]
                    points = [p for p in points if p]
                    if len(points) > 1:
                        coords = [panel_xy(p["x"], p["y"], (ox, oy)) for p in points]
                        draw.line(coords, fill=color, width=2)
                draw.text((box[0] + 5, box[1] + 5), "birth cohorts: 0–1200–2400–3600–4800–6000+ s",
                          fill=(20, 20, 20), font=SMALL, stroke_width=1, stroke_fill="white")
            draw.rectangle((box[0], box[1], box[2] - 1, box[3] - 1), outline=(150, 150, 150), width=1)
            draw.text((box[0], box[3] + 4), "x: 0 → 1   y: 0 ↓ 1 · renderer screen coordinates",
                      fill=(70, 70, 70), font=SMALL)
    image.save(output, format="PNG", optimize=True)
    return {"path": output.name, "width": w, "height": h, "sha256": sha256(output)}


def smoothstep(low, high, value):
    t = min(1.0, max(0.0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def make_trace_sheet(runs, output):
    cell_w, cell_h = PANEL, PANEL
    w = 3 * (cell_w + PAD) + PAD
    h = TITLE_H + 2 * (LABEL_H + cell_h + 24)
    image = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(image)
    draw.text((PAD, 12), "Recent ant traces · exact preceding 120 s · 10 Hz", fill=(20, 20, 20), font=TITLE)
    for row, run in enumerate(runs):
        for col, second in enumerate(TRACE_CHECKPOINTS):
            ox = PAD + col * (cell_w + PAD)
            oy = TITLE_H + row * (LABEL_H + cell_h + 24)
            box = (ox, oy + LABEL_H, ox + cell_w, oy + LABEL_H + cell_h)
            draw.text((ox, oy), f"{run['label']} · {second - 120:,}–{second:,} model s", fill=(30, 30, 30), font=FONT)
            draw.rectangle(box, fill="white", outline=(145, 145, 145), width=1)
            previous = {}
            for tick, agents in run["traces"][second]:
                current = {}
                for ant_id, x, y, _heading in agents:
                    point = (x, y)
                    prior = previous.get(ant_id)
                    if prior and (max(abs(x - prior[0][0]), abs(y - prior[0][1])) <= 0.1):
                        a = (box[0] + prior[0][0] * cell_w, box[1] + prior[0][1] * cell_h)
                        b = (box[0] + x * cell_w, box[1] + y * cell_h)
                        draw.line((a, b), fill=(65, 65, 65), width=1)
                    current[ant_id] = (point, tick)
                # Only immediately adjacent samples can continue a path: missing ID breaks it.
                previous = {key: value for key, value in current.items()
                            if value[1] == tick}
            draw.rectangle((box[0], box[1], box[2] - 1, box[3] - 1), outline=(150, 150, 150), width=1)
            draw.text((box[0], box[3] + 4), "x: 0 → 1   y: 0 ↓ 1 · discontinuities >0.1 break", fill=(70, 70, 70), font=SMALL)
    image.save(output, format="PNG", optimize=True)
    return {"path": output.name, "width": w, "height": h, "sha256": sha256(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    runs = [load_run(label, path) for label, path in ROWS]
    outputs = []
    for mode, title in (("field", "Pheromone · native 96×96 grid · fixed renderer transfer"),
                         ("ants", "Ant positions and heading · checkpoint snapshots"),
                         ("material", "Persistent material occupancy · mask union"),
                         ("routes", "Born principal routes · fixed birth-time cohorts")):
        outputs.append(make_sheet(title, runs, args.output / f"{mode}-checkpoints.png", mode))
    outputs.append(make_trace_sheet(runs, args.output / "ant-traces-120s.png"))
    assert all(row["width"] == 2 * PAD + len(CHECKPOINTS) * PANEL + (len(CHECKPOINTS) - 1) * 16
               for row in outputs[:4])
    manifest = {"diagnosticOnly": True, "seed": 20261005,
        "checkpointModelSeconds": list(CHECKPOINTS), "traceWindowsModelSeconds": {str(t): [t - 120, t] for t in TRACE_CHECKPOINTS},
        "coordinateConvention": "Normalized x,y drawn as AntRenderer: image x right, y down; no axis inversion.",
        "pheromoneMapping": "AntRenderer fixed two-scale alpha transfer rendered as black alpha over white; no per-panel normalization.",
        "materialUnion": "Boolean OR of per-plate 96x96 masks from publicSnapshot.surfacePlates.plates.",
        "routeColors": "Diagnostic birth-time cohorts at fixed 1200 model-second intervals; not production renderer colors.",
        "traceRule": "Only consecutive 10 Hz samples for a continuously present ID; coordinate jumps over 0.1 normalized units break segments.",
        "inputs": [{"label": run["label"], "path": run["input"].relative_to(ROOT).as_posix(),
                    "sha256": run["inputSha256"], "modelSeconds": run["seconds"],
                    "resultSourceHashes": run["resultSourceHashes"]} for run in runs],
        "outputs": outputs}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (args.output / "README.md").write_text(readme(manifest), encoding="utf-8")
    assert all((args.output / row["path"]).stat().st_size > 10000 for row in outputs)
    print(json.dumps({"out": str(args.output), "outputs": outputs}, indent=2))


def readme(manifest):
    files = "\n".join(f"- `{row['path']}` — {row['width']}×{row['height']}, SHA-256 `{row['sha256']}`"
                      for row in manifest["outputs"])
    return fr"""# Spatial dynamics visual artifacts

Offline diagnostic views of the completed accelerated 7,200 model-second seed `20261005` captures. The rows compare `production` and `dtFeedback` from the same starting seed. They are not browser/runtime stability evidence or evidence that behavior is biologically/socially organized.

The checkpoint sheets cover {', '.join(map(str, CHECKPOINTS))} model seconds. The trace sheet uses the exact preceding 120 model seconds at 10 Hz for 600, 1800 and 7200 seconds. Source coordinates remain in renderer screen convention: normalized x increases rightward and normalized y increases downward.

Pheromone panels use the same fixed two-scale alpha transfer as `src/lib/renderers/AntRenderer.js`, rendered as gray over white, with checkpoint ant positions and headings overlaid. It is not normalized per panel. Material panels show the OR union of the per-Plate 96×96 masks. Principal route colors are fixed 1200-second birth cohorts for legibility; those colors are diagnostic and are not part of the production renderer. Ant headings use `cos(heading), sin(heading)` in screen coordinates.

Traces connect an ID only across adjacent samples where it remains present. An absent sample breaks the line; a displacement over 0.1 normalized units is treated as a wrap/teleport break. No identity is inferred across exit or re-entry.

These graphics distinguish live snapshots, persistent union and principal-route history. They are visual aids and do not establish route turnover or social roles. Input hashes, source hashes, definitions and image receipts are in `manifest.json`.

## Reproduction

From repository root, with Pillow available in the bundled Python runtime:

```powershell
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/ant-spatial-visual.py
```

The script refuses to overwrite an existing output directory and reads only the two explicitly named completed `result.json` inputs. It checks schema, seed, checkpoint presence, fixed field/mask shapes, route indices, sampled tick range and output receipts.

## Outputs

{files}
"""


if __name__ == "__main__":
    main()
