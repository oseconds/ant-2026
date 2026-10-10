from __future__ import annotations

import csv
import gzip
import hashlib
import json
import sys
import textwrap
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path.cwd()
PACKAGE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "docs/ant/evidence/2026-10-10-w1-post-contact-field-retention-audit"
RESULTS = PACKAGE / "results"
PLOTS = PACKAGE / "plots"
WIDTH = HEIGHT = 96
TARGETS = [120, 300, 480, 599.25]
SEEDS = [20261005, 20261006, 20261007]
AGE_COLORS = {"never": "#777777", "0-20": "#e76f51", "20-90": "#2a9d8f", ">90": "#4361ee"}

matplotlib.rcParams["svg.hashsalt"] = "ant-w1-post-contact-field-retention-audit"
matplotlib.rcParams["font.family"] = "DejaVu Sans"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_checkpoint_rows() -> dict[tuple[int, float], dict[str, np.ndarray]]:
    groups: dict[tuple[int, float], dict[str, np.ndarray]] = {}
    with gzip.open(RESULTS / "checkpoint-cells.csv.gz", "rt", newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        for row in reader:
            seed, target, cell = int(row["seed"]), float(row["requestedSeconds"]), int(row["cellIndex"])
            key = (seed, target)
            if key not in groups:
                groups[key] = {"timeSeconds": np.full(WIDTH * HEIGHT, np.nan)}
                for name in reader.fieldnames:
                    if name not in {"seed", "requestedSeconds", "frameIndex", "timeSeconds", "previousTimeSeconds", "cellIndex", "x", "y"}:
                        groups[key][name] = np.full(WIDTH * HEIGHT, np.nan)
            assert 0 <= cell < WIDTH * HEIGHT
            assert int(row["x"]) == cell % WIDTH and int(row["y"]) == cell // WIDTH
            values = groups[key]
            assert np.isnan(values["timeSeconds"][cell]), f"duplicate cell {key}:{cell}"
            values["timeSeconds"][cell] = float(row["timeSeconds"])
            for name, array in values.items():
                if name == "timeSeconds":
                    continue
                value = row.get(name, "")
                array[cell] = np.nan if value == "" else float(value)
    assert len(groups) == len(SEEDS) * len(TARGETS)
    for key, arrays in groups.items():
        assert np.isfinite(arrays["timeSeconds"]).all(), f"incomplete 96x96 checkpoint {key}"
        assert arrays["q"].size == WIDTH * HEIGHT
    return groups


def map_from_flat(values: np.ndarray) -> np.ndarray:
    assert values.size == WIDTH * HEIGHT
    return values.reshape((HEIGHT, WIDTH))


def save_pair(fig: plt.Figure, stem: str) -> list[Path]:
    png, svg = PLOTS / f"{stem}.png", PLOTS / f"{stem}.svg"
    fig.savefig(png, dpi=130, bbox_inches="tight", metadata={"Software": "Matplotlib"})
    fig.savefig(svg, bbox_inches="tight", metadata={"Date": "2026-10-10", "Creator": "Matplotlib"})
    plt.close(fig)
    return [png, svg]


def plot_checkpoint_sheets(groups: dict, summary: dict) -> list[Path]:
    ranges = summary["displayScales"]["fieldRanges"]
    deltas = summary["displayScales"]["deltaRanges"]
    residual = summary["displayScales"]["surfacePassiveResidual"]
    all_same = np.concatenate([groups[(seed, target)]["sameCellFootPointsSincePreviousObservation"]
                               for seed in SEEDS for target in TARGETS])
    all_footprint = np.concatenate([groups[(seed, target)]["surfaceFootprintContactPointsSincePreviousObservation"]
                                    for seed in SEEDS for target in TARGETS])
    max_same = max(1.0, float(np.nanmax(all_same)))
    max_footprint = max(1.0, float(np.nanmax(all_footprint)))
    age_map = matplotlib.colormaps["magma"].copy()
    age_map.set_bad("#e2e2e2")
    state_layers = [
        ("ID 0 union", "id0HistoricalUnion", "gray", 0, 1, None),
        ("Current active", "currentActive", "gray", 0, 1, None),
        ("Current q", "q", "gray", 0, 1, None),
        ("Same-cell age (s; gray = never)", "lastSameCellContactAgeSeconds", age_map, 0, 599.25, "age"),
        ("Surface-footprint age (s)", "lastSurfaceFootprintContactAgeSeconds", age_map, 0, 599.25, "age"),
        ("chemicalMemory", "chemicalMemory", "viridis", *ranges["chemicalMemory"], None),
        ("surface", "surface", "viridis", *ranges["surface"], None),
        ("Stored support", "support", "viridis", *ranges["support"], None),
        ("Support sampled", "supportSampled", "gray", 0, 1, None),
    ]
    interval_layers = [
        ("Delta chemicalMemory", "deltaChemicalMemory", "coolwarm", *deltas["chemicalMemory"], None),
        ("Delta surface", "deltaSurface", "coolwarm", *deltas["surface"], None),
        ("Delta support", "deltaSupport", "coolwarm", *deltas["support"], None),
        ("Surface − passive reference", "surfacePassiveResidual", "coolwarm", *residual, None),
        ("Same-cell points", "sameCellFootPointsSincePreviousObservation", "magma", 0, max_same, None),
        ("Surface footprint writes", "surfaceFootprintContactPointsSincePreviousObservation", "magma", 0, max_footprint, None),
        ("q changed since prior sample", "qChanged", "gray", 0, 1, None),
    ]
    outputs = []
    for seed in SEEDS:
        for group_name, layers in [("states", state_layers), ("intervals", interval_layers)]:
            fig, axes = plt.subplots(len(layers), len(TARGETS), figsize=(16, 2.8 * len(layers)), squeeze=False)
            fig.suptitle(f"W1 post-contact {group_name} — seed {seed} — fixed 96×96 world scale", fontsize=14, y=1.035)
            for column, target in enumerate(TARGETS):
                frame = groups[(seed, target)]
                actual = float(np.nanmedian(frame["timeSeconds"]))
                axes[0, column].set_title(f"requested {target:g} s\nobserved {actual:.6f} s", fontsize=8)
            for row, (label, key, cmap, vmin, vmax, special) in enumerate(layers):
                for column, target in enumerate(TARGETS):
                    ax = axes[row, column]
                    flat = groups[(seed, target)][key].copy()
                    if special == "age":
                        flat[flat < 0] = np.nan
                    values = map_from_flat(flat)
                    ax.imshow(values, origin="lower", extent=(0, 96, 0, 96), interpolation="nearest",
                              cmap=cmap, vmin=vmin, vmax=vmax, aspect="equal")
                    ax.set_xlim(0, 96); ax.set_ylim(0, 96)
                    ax.set_xticks([0, 24, 48, 72, 96]); ax.set_yticks([0, 24, 48, 72, 96])
                    ax.tick_params(labelsize=6, length=2, labelleft=column == 0,
                                   labelbottom=row == len(layers) - 1)
                    if column == 0:
                        ax.set_ylabel(f"{textwrap.fill(label, width=20)}\n[{vmin:.4g}, {vmax:.4g}]",
                                      fontsize=8, labelpad=8)
                    if row == len(layers) - 1:
                        ax.set_xlabel("world x (cell extent)", fontsize=7)
            fig.text(0.5, 0.003, "Actual archived cell values only; no links, interpolation, or per-panel normalization.",
                     ha="center", fontsize=8)
            fig.subplots_adjust(left=0.15, right=0.985, top=0.90, bottom=0.04, hspace=0.32, wspace=0.18)
            outputs.extend(save_pair(fig, f"post-contact-{group_name}-seed{seed}"))
    return outputs


def load_cohorts() -> list[dict]:
    with gzip.open(RESULTS / "field-cohort-summary.csv.gz", "rt", newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def plot_age_timeline(cohorts: list[dict], summary: dict) -> list[Path]:
    fields = ["chemicalMemory", "surface", "support"]
    ranges = summary["displayScales"]["deltaRanges"]
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)
    for ax, field in zip(axes, fields):
        # Recombine q/active/ID0 strata by their observed cell counts within each actual frame.
        pooled = defaultdict(lambda: [0, 0.0])
        for row in cohorts:
            if row["field"] != field or row["contactAgeBand"] == "never" or not row["deltaCount"]:
                continue
            key = (int(row["seed"]), float(row["timeSeconds"]), row["contactAgeBand"])
            count = int(row["deltaCount"])
            pooled[key][0] += count
            pooled[key][1] += count * float(row["deltaMean"])
        for age_band, color in AGE_COLORS.items():
            if age_band == "never":
                continue
            for seed in SEEDS:
                points = [(time_s, total / count) for (row_seed, time_s, band), (count, total) in pooled.items()
                          if row_seed == seed and band == age_band and count]
                if points:
                    xs, ys = zip(*sorted(points))
                    ax.scatter(xs, ys, s=5, alpha=0.32, color=color, edgecolors="none")
        ax.set_ylabel(f"{field}\nmean observed Δ", fontsize=9)
        ax.set_ylim(*ranges[field]); ax.grid(alpha=0.2)
    axes[-1].set_xlim(0, 599.25); axes[-1].set_xlabel("actual archived observation time (s)")
    handles = [plt.Line2D([], [], marker="o", linestyle="", color=AGE_COLORS[band], label=band)
               for band in ["0-20", "20-90", ">90"]]
    fig.legend(handles=handles, loc="upper right", title="same-cell contact age at observation (s)")
    fig.suptitle("Post-contact field deltas by last same-cell contact age\npoints are exact archived observation summaries; no smoothing", y=0.99)
    return save_pair(fig, "post-contact-age-band-deltas")


def plot_representative_traces() -> list[Path]:
    rows = []
    with (RESULTS / "representative-cell-traces.csv").open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    fields = [("chemicalMemory", "chemicalMemory", (0, 0.9519418)),
              ("surface", "surface", (0, 0.9761037)),
              ("support", "support", (0, 0.9651266))]
    fig, axes = plt.subplots(len(SEEDS), len(fields), figsize=(16, 9), squeeze=False)
    for col, (field, title, limits) in enumerate(fields):
        for row_index, seed in enumerate(SEEDS):
            ax = axes[row_index, col]
            for band, color in AGE_COLORS.items():
                if band == "never":
                    continue
                subset = [row for row in rows if int(row["seed"]) == seed and row["finalAgeBand"] == band]
                if subset:
                    xs = [float(row["timeSeconds"]) for row in subset]
                    ys = [float(row[field]) for row in subset]
                    ax.scatter(xs, ys, s=7, alpha=0.55, color=color, edgecolors="none", label=band)
            ax.set_ylim(*limits); ax.set_xlim(0, 599.25); ax.grid(alpha=0.2)
            ax.set_title(f"seed {seed}" if col == 0 else "", fontsize=9)
            if row_index == 0:
                ax.set_title(title, fontsize=10)
            if col == 0:
                ax.set_ylabel("observed field value")
            if row_index == len(SEEDS) - 1:
                ax.set_xlabel("actual observation time (s)")
    handles = [plt.Line2D([], [], marker="o", linestyle="", color=AGE_COLORS[band], label=f"final contact age {band} s")
               for band in ["0-20", "20-90", ">90"]]
    fig.legend(handles=handles, loc="upper center", ncol=3, bbox_to_anchor=(0.5, 1.01))
    fig.suptitle("Representative ID 0 cells chosen by lowest row-major index within final contact-age bands\nactual samples only; markers are not connected", y=0.97)
    return save_pair(fig, "representative-cell-observation-traces")


def plot_surface_replay(summary: dict) -> list[Path]:
    fig, ax = plt.subplots(figsize=(11, 4))
    for seed in SEEDS:
        row = next(item for item in summary["validations"]["perSeed"] if item["seed"] == seed)
        assert row["surfaceReplay"]["maxAbsoluteError"] == 0
        ax.scatter([seed], [row["surfaceReplay"]["maxAbsoluteError"]], s=45, label=str(seed))
    ax.axhline(0, color="#444444", linewidth=1)
    ax.set_xticks(SEEDS, [str(seed) for seed in SEEDS])
    ax.set_ylim(-1e-8, 1e-8); ax.set_ylabel("max |replayed − archived surface|")
    ax.set_xlabel("seed"); ax.set_title("Exact existing SurfaceField update replay at all 599 observations per seed")
    ax.grid(axis="y", alpha=0.25)
    return save_pair(fig, "surface-field-replay-exactness")


def main() -> None:
    PLOTS.mkdir(parents=True, exist_ok=True)
    summary = json.loads((RESULTS / "summary.json").read_text(encoding="utf-8"))
    groups = load_checkpoint_rows()
    outputs = []
    outputs.extend(plot_checkpoint_sheets(groups, summary))
    outputs.extend(plot_age_timeline(load_cohorts(), summary))
    outputs.extend(plot_representative_traces())
    outputs.extend(plot_surface_replay(summary))
    manifest = {
        "fixedWorldExtent": [0, 96, 0, 96],
        "imageInterpolation": "nearest; stored source cells only",
        "milestonesRequestedSeconds": TARGETS,
        "seeds": SEEDS,
        "rawFieldScales": summary["displayScales"]["fieldRanges"],
        "deltaScales": summary["displayScales"]["deltaRanges"],
        "surfacePassiveResidualScale": summary["displayScales"]["surfacePassiveResidual"],
        "contactAgeScaleSeconds": [0, 599.25],
        "perPanelNormalization": False,
        "timeTraces": "Actual archived observation markers only; no connecting lines.",
        "files": [{"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)} for path in sorted(outputs)],
    }
    manifest_path = PLOTS / "plot-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    validation = {
        "status": "fixed-scale checks passed",
        "checkpointGroups": len(groups),
        "cellsPerGroup": WIDTH * HEIGHT,
        "allGroupsComplete": True,
        "allPlotsUseFixedExtent": True,
        "allFieldRangesSharedAcrossSeedAndTime": True,
        "supportSampleStatePlottedSeparately": True,
        "figures": [{"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)} for path in sorted(outputs)],
    }
    (PACKAGE / "validation").mkdir(parents=True, exist_ok=True)
    (PACKAGE / "validation" / "fixed-scale-plots.json").write_text(json.dumps(validation, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"figures": len(outputs), "checkpointGroups": len(groups), "validation": validation["status"]}))


if __name__ == "__main__":
    main()
