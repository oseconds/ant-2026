"""Fixed-scale BODY footprint references. Not the production ANT renderer."""
import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-material-body-design-space"
GROUPS = {"structure-atlas.png": ["P", "K", "X", "H"], "history-atlas.png": ["U", "W", "S"]}
NAMES = {"P": "existing production", "K": "fixed node sections", "X": "continuous edge sleeve",
         "U": "uniform mean control", "W": "attached chemical sections", "S": "ambient chemical contour", "H": "cohesive lamina"}


def plot(data, ids):
    canvas = Image.new("RGB", (10 + len(ids) * 650, 1590), "white")
    draw = ImageDraw.Draw(canvas)
    title, text = ImageFont.load_default(size=18), ImageFont.load_default(size=15)
    draw.text((12, 8), "FIXED COMMIT SCOPE / BODY REFERENCES - G, H0, seed 20261005, Audio Off", fill="black", font=title)
    draw.text((12, 34), "Same 96 x 96 source-cell display mapped to 640 x 640. Gray=body footprint; blue=fixed scope node.", fill="black", font=text)
    draw.text((12, 56), "Diagnostic fixed fill; no ants, pheromone, 3D extrusion, production alpha, or acoustic/perceptual verdict.", fill="black", font=text)
    checked = 0
    for row, event in enumerate(data["events"]):
        for col, code in enumerate(ids):
            case = next(c for c in event["cases"] if c["id"] == code)
            mask = case["mask"]
            source = Image.frombytes("L", (96, 96), bytes(150 if v else 255 for v in mask))
            panel = source.resize((640, 640), resample=Image.Resampling.NEAREST).convert("RGB")
            # Check every source-cell center before the common scope overlay.
            for i, v in enumerate(mask):
                x, y = int((i % 96 + .5) * 640 / 96), int((i // 96 + .5) * 640 / 96)
                assert panel.getpixel((x, y)) == ((150, 150, 150) if v else (255, 255, 255))
                checked += 1
            ink = ImageDraw.Draw(panel)
            for i in event["scope"]:
                p = (int((i % 96 + .5) * 640 / 96), int((i // 96 + .5) * 640 / 96))
                ink.point(p, fill=(25, 80, 150))
            ox, oy = 10 + 650 * col, 108 + 760 * row
            canvas.paste(panel, (ox, oy))
            draw.text((ox, oy - 25), f"{event['id']} / {code}: {NAMES[code]}", fill="black", font=title)
            draw.text((ox, oy + 646), f"source cells={case['cells']}; 4-components={len(case['sourceComponents4'])}", fill="black", font=text)
        draw.text((12, 788 + 760 * row), f"fixed actual COMMIT={event['timeSeconds']:.6f}s; whole-body coefficient differences are not displayed", fill="black", font=text)
    stream = BytesIO()
    canvas.save(stream, format="PNG")
    return stream.getvalue(), checked


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = json.loads((BASE / "analysis.json").read_text(encoding="utf-8"))
    receipt = {"pillow": PIL.__version__, "panel": [640, 640], "sourceGrid": [96, 96], "figures": []}
    for name, ids in GROUPS.items():
        image, checked = plot(data, ids)
        if args.check:
            assert (BASE / name).read_bytes() == image
        else:
            (BASE / name).write_bytes(image)
        receipt["figures"].append({"path": name, "ids": ids, "sha256": hashlib.sha256(image).hexdigest(), "sourceCentersChecked": checked})
    content = json.dumps(receipt, indent=2) + "\n"
    if args.check:
        assert (BASE / "atlas-validation.json").read_text(encoding="utf-8") == content
    else:
        (BASE / "atlas-validation.json").write_text(content, encoding="utf-8", newline="\n")
    print(json.dumps(receipt))
