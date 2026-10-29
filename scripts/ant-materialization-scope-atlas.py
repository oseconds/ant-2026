"""Static structural reference plot; glyph size is not Plate width."""
import argparse
import gzip
import hashlib
import json
from io import BytesIO
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/ant/evidence/2026-10-29-materialization-scope-exploration"
GRAY = (190, 196, 202)
GREEN = (10, 100, 85)
AMBER = (182, 90, 10)
WHITE = (255, 255, 255)
LABELS = ["L: commit-selected I", "F: first-selection I", "P: commit principal path"]


def render():
    packet = json.loads(gzip.decompress((BASE / "data/frozen-structures.json.gz").read_bytes()))
    analysis = json.loads((BASE / "analysis.json").read_text(encoding="utf-8"))
    canvas = Image.new("RGB", (1960, 1590), WHITE)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=18)
    small = ImageFont.load_default(size=15)
    draw.text((16, 8), "SCOPE REFERENCES - existing G / H0 / seed 20261005 / Audio Off", fill="black", font=font)
    draw.text((16, 34), "Green: selected structural points. Gray: commit H outside reference. Amber: selected outside commit H.", fill="black", font=small)
    draw.text((16, 56), "No body, ribbon, width or material. Same 640 x 640 display frame mapped from the 96 x 96 source grid.", fill="black", font=small)
    checked = 0
    for row, (event, measured) in enumerate(zip(packet["events"], analysis["events"])):
        last = event["frames"][-1]
        references = [last["I"], event["frames"][0]["I"], last["pathCells"]]
        for col, (label, selected) in enumerate(zip(LABELS, references)):
            ox, oy = 10 + col * 650, 108 + row * 760
            image = Image.new("RGB", (640, 640), WHITE)
            glyphs = ImageDraw.Draw(image)
            support, included = set(last["H"]), set(selected)

            def point(cell):
                return round((cell % 96) * 639 / 95), round((cell // 96) * 639 / 95)

            for cell in support | included:
                x, y = point(cell)
                color = GREEN if cell in included and cell in support else AMBER if cell in included else GRAY
                glyphs.rectangle((x - 1, y - 1, x + 1, y + 1), fill=color)
            # Every source coordinate center must carry its reference classification.
            for cell in range(96 * 96):
                expected = GREEN if cell in included and cell in support else AMBER if cell in included else GRAY if cell in support else WHITE
                assert image.getpixel(point(cell)) == expected
                checked += 1
            canvas.paste(image, (ox, oy))
            draw.text((ox + 2, oy - 26), f"{event['id']} / {label}", fill="black", font=font)
            outside = len(included - support)
            draw.text((ox + 2, oy + 646), f"points={len(selected)}; outside commit H={outside}", fill="black", font=small)
        draw.text((12, 788 + row * 760), f"actual START={measured['startSeconds']:.6f}s; COMMIT={measured['commitSeconds']:.6f}s", fill="black", font=small)
    stream = BytesIO()
    canvas.save(stream, format="PNG")
    return stream.getvalue(), {"pillow": PIL.__version__, "size": list(canvas.size),
        "sourceCentersChecked": checked, "nativePanel": [640, 640],
        "meaning": "structural points only; not material support or branch genealogy",
        "pngSha256": hashlib.sha256(stream.getvalue()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    image, receipt = render()
    target = BASE / "scope-atlas.png"
    receipt_path = BASE / "atlas-validation.json"
    text = json.dumps(receipt, indent=2) + "\n"
    if args.check:
        assert target.read_bytes() == image
        assert receipt_path.read_text(encoding="utf-8") == text
    else:
        target.write_bytes(image)
        receipt_path.write_text(text, encoding="utf-8", newline="\n")
    print(json.dumps(receipt))
