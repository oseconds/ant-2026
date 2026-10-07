#!/usr/bin/env python3
"""Plot descriptive S2a observed/null summaries from ant-social-null.js output."""
import argparse
import gzip
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


SEEDS = (20261005, 20261006, 20261007)
WINDOWS = (0.25, 1, 5, 20)
COLORS = ("#2878b5", "#e07a24", "#3a9d5d")
METRICS = (
    ("edgeCount", "Mean edge count", lambda w: w["metrics"]["edgeCount"]["mean"]),
    ("componentCount", "Mean component count", lambda w: w["metrics"]["componentCount"]["mean"]),
    ("largestComponentRatio", "Mean largest-component ratio", lambda w: w["metrics"]["largestComponentRatio"]["mean"]),
    ("weightedDegree", "Mean weighted degree (s)", lambda w: w["metrics"]["weightedDegree"]["mean"]),
    ("bridgePersistEvents", "Bridge persistence events", lambda w: w["eventCounts"].get("BRIDGE_PERSIST", 0)),
    ("articulationPersistEvents", "Articulation persistence events", lambda w: w["eventCounts"].get("ARTICULATION_PERSIST", 0)),
    ("connectorPersistEvents", "Connector persistence events", lambda w: w["eventCounts"].get("CONNECTOR_PERSIST", 0)),
    ("mergeCount", "Component merges", lambda w: w["eventCounts"].get("COMPONENT_MERGE", 0)),
    ("splitCount", "Component splits", lambda w: w["eventCounts"].get("COMPONENT_SPLIT", 0)),
)
TIMELINE_METRICS = (
    ("edgeCount", "Edge count"),
    ("componentCount", "Component count"),
    ("largestComponentRatio", "Largest-component ratio"),
    ("weightedDegreeMean", "Mean weighted degree (s)"),
)


def load_packet(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        packet = json.load(stream)
    if packet.get("schemaVersion") != 1 or packet.get("seed") not in SEEDS:
        raise ValueError(f"Unsupported packet: {path}")
    if not packet.get("nulls"):
        raise ValueError(f"Packet has no null replicates: {path}")
    return packet


def window(run, seconds):
    return next(item for item in run["windows"] if item["windowSeconds"] == seconds)


def assert_finite(values, context):
    if not np.all(np.isfinite(values)):
        raise ValueError(f"Non-finite plotted values: {context}")


def plot_run_summaries(packets, out):
    fig, axes = plt.subplots(3, 3, figsize=(13, 8), constrained_layout=True)
    offsets = (-0.19, 0, 0.19)
    scales = {}
    for ax, (key, title, measure) in zip(axes.flat, METRICS):
        for si, packet in enumerate(packets):
            color = COLORS[si]
            for wi, seconds in enumerate(WINDOWS):
                x = wi + offsets[si]
                vals = np.asarray([measure(window(run, seconds)) for run in packet["nulls"]], dtype=float)
                assert_finite(vals, f"{key}, seed {packet['seed']}, window {seconds}")
                ax.scatter(np.full(len(vals), x), vals, s=7, alpha=0.25, color=color,
                           linewidths=0, rasterized=True)
                observed = measure(window(packet["observed"], seconds))
                assert_finite(np.asarray([observed]), f"observed {key}, seed {packet['seed']}, window {seconds}")
                ax.scatter([x], [observed], marker="D", s=22, color=color,
                           edgecolors="black", linewidths=0.35, zorder=4)
        ax.set_title(title, fontsize=9)
        high = max(float(values[:, 1].max()) for collection in ax.collections
                   if (values := collection.get_offsets()).size) if ax.collections else 0
        upper = max(high * 1.05, 1.0)
        ax.set_ylim(0, upper)
        scales[key] = [0, upper]
        ax.set_xticks(range(4), ["0.25", "1", "5", "20"])
        ax.grid(axis="y", alpha=0.2)
        ax.tick_params(labelsize=8)
    fig.supxlabel("Topology window (seconds); 1 s primary, 0.25 s transient, 5/20 s memory sensitivity")
    fig.suptitle("Observed runs (diamonds) and individual phase-shift null runs (points)", fontsize=12)
    fig.legend([plt.Line2D([], [], marker="o", linestyle="", color=c) for c in COLORS],
               [str(p["seed"]) for p in packets], loc="upper right", bbox_to_anchor=(1.12, 1),
               title="Seed", fontsize=8)
    fig.savefig(out / "run-summaries.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return scales


def plot_timelines(packets, out):
    fig, axes = plt.subplots(4, 3, figsize=(14, 9), sharex="col", constrained_layout=True)
    for si, packet in enumerate(packets):
        obs = packet["observed"]["timeline"]
        times = np.asarray([row["seconds"] for row in obs])
        assert_finite(times, f"timeline times, seed {packet['seed']}")
        if len(times) < 2 or not np.allclose(np.diff(times), 1.0):
            raise ValueError(f"Expected 1 Hz timeline cadence for seed {packet['seed']}")
        null_timelines = [run["timeline"] for run in packet["nulls"]]
        for timeline in null_timelines:
            null_times = np.asarray([row["seconds"] for row in timeline])
            if not np.array_equal(null_times, times):
                raise ValueError(f"Null timeline cadence differs for seed {packet['seed']}")
        for mi, (key, title) in enumerate(TIMELINE_METRICS):
            ax = axes[mi, si]
            observed = np.asarray([next(w[key] for w in row["windows"] if w["windowSeconds"] == 1)
                                     for row in obs])
            matrix = np.asarray([[next(w[key] for w in row["windows"] if w["windowSeconds"] == 1)
                                  for row in timeline] for timeline in null_timelines], dtype=float)
            assert_finite(observed, f"observed timeline {key}, seed {packet['seed']}")
            assert_finite(matrix, f"null timeline {key}, seed {packet['seed']}")
            lo, median, hi = np.percentile(matrix, [10, 50, 90], axis=0)
            ax.fill_between(times, lo, hi, color="#8795a1", alpha=0.28,
                            label="Null 10th–90th percentile band")
            ax.plot(times, median, color="#5b6872", linewidth=0.75, label="Null median")
            ax.plot(times, observed, color="#b33a3a", linewidth=0.8, label="Observed")
            ax.grid(alpha=0.18)
            ax.tick_params(labelsize=7)
            if si == 0:
                ax.set_ylabel(title, fontsize=8)
            if mi == 0:
                ax.set_title(f"Seed {packet['seed']}", fontsize=9)
            if mi == 3:
                ax.set_xlabel("Time (s)", fontsize=8)
    for row_axes in axes:
        low = 0.0
        high = max(ax.get_ylim()[1] for ax in row_axes)
        for ax in row_axes:
            ax.set_ylim(low, high)
    fig.legend([plt.Line2D([], [], color="#b33a3a"), plt.Line2D([], [], color="#5b6872"),
                plt.Rectangle((0, 0), 1, 1, color="#8795a1", alpha=0.28)],
               ["Observed", "Null median", "Null 10th–90th percentile band"],
               loc="lower center", bbox_to_anchor=(0.5, -0.04), ncol=3, fontsize=8)
    fig.suptitle("1 s topology timelines by seed; null bands are descriptive", fontsize=12)
    fig.savefig(out / "one-second-timelines.png", dpi=160, bbox_inches="tight")
    scales = {key: [0.0, float(axes[i, 0].get_ylim()[1])]
              for i, (key, _) in enumerate(TIMELINE_METRICS)}
    plt.close(fig)
    return scales


def normalized_hist(hist):
    counts = np.asarray(hist["histogram"]["counts"], dtype=float)
    total = counts.sum()
    bins = np.asarray(hist["histogram"]["lowerBoundsSeconds"], dtype=float)
    assert_finite(counts, "lifetime histogram counts")
    assert_finite(bins, "lifetime histogram bins")
    if np.any(counts < 0) or len(counts) != len(bins) or total != hist["completed"]["n"]:
        raise ValueError("Invalid completed-lifetime histogram")
    fractions = counts / total if total else counts
    if total and not np.isclose(fractions.sum(), 1.0):
        raise ValueError("Normalized completed-lifetime histogram does not sum to one")
    return bins, fractions


def plot_lifetimes(packets, out):
    fig, axes = plt.subplots(2, 3, figsize=(14, 7), sharey=True, constrained_layout=True)
    specs = [("raw", "Raw encounter completed lifetimes")]
    specs.extend((seconds, f"{seconds:g} s temporal-edge completed lifetimes"
                  + (" (primary)" if seconds == 1 else " (transient)" if seconds == 0.25 else " (memory sensitivity)"))
                 for seconds in WINDOWS)
    all_axes = axes.flat
    for ax, (path, title) in zip(all_axes, specs):
        reference_bins = None
        for si, packet in enumerate(packets):
            observed_hist = (packet["observed"]["raw"]["lifetimes"] if path == "raw"
                             else window(packet["observed"], path)["temporalEdgeLifetimes"])
            observed_bins, observed = normalized_hist(observed_hist)
            reference_bins = observed_bins
            samples = []
            for run in packet["nulls"]:
                null_hist = run["raw"]["lifetimes"] if path == "raw" else window(run, path)["temporalEdgeLifetimes"]
                bins, values = normalized_hist(null_hist)
                if not np.array_equal(bins, reference_bins):
                    raise ValueError("Lifetime histogram bins differ")
                samples.append(values)
            lo, median, hi = np.percentile(np.asarray(samples), [10, 50, 90], axis=0)
            x = np.arange(len(reference_bins))
            ax.fill_between(x, lo, hi, color=COLORS[si], alpha=0.12)
            ax.plot(x, median, color=COLORS[si], linewidth=1, label=f"{packet['seed']} null median")
            ax.plot(x, observed, color=COLORS[si], linewidth=1, linestyle="--",
                    label=f"{packet['seed']} observed")
        labels = [f"{v:g}" for v in reference_bins]
        labels[-1] = f"≥{reference_bins[-1]:g}"
        ax.set_xticks(np.arange(len(labels)), labels, rotation=45, ha="right")
        ax.set_title(title, fontsize=9)
        ax.set_xlabel("Completed lifetime bin lower bound (s)", fontsize=8)
        ax.grid(axis="y", alpha=0.2)
        ax.tick_params(labelsize=7)
    for ax in axes[:, 0]:
        ax.set_ylabel("Fraction of completed lifetimes", fontsize=8)
    axes.flat[-1].axis("off")
    fig.suptitle("Fixed-bin normalized completed-lifetime distributions; bands show null 10th–90th percentiles",
                 fontsize=11)
    upper = max(ax.get_ylim()[1] for ax in axes.flat if ax.get_visible())
    for ax in axes.flat:
        if ax.get_visible():
            ax.set_ylim(0, upper)
    handles = ([plt.Line2D([], [], color=color, label=str(seed)) for seed, color in zip(SEEDS, COLORS)]
               + [plt.Line2D([], [], color="#444", linestyle="-", label="Null median"),
                  plt.Line2D([], [], color="#444", linestyle="--", label="Observed"),
                  plt.Rectangle((0, 0), 1, 1, color="#8795a1", alpha=0.28,
                                label="Null 10th–90th percentile band")])
    axes.flat[-1].legend(handles=handles, loc="center", ncol=1, fontsize=7, frameon=False)
    fig.savefig(out / "completed-lifetimes.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return [0.0, float(upper)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Directory with summary.json and seed packets")
    parser.add_argument("--output", required=True, type=Path, help="Directory for PNG plots and metadata")
    args = parser.parse_args()
    summary_path = args.input / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    seeds = [item["seed"] for item in summary.get("seeds", [])]
    if seeds != list(SEEDS):
        raise ValueError(f"Expected summary seeds {SEEDS}, got {seeds}")
    packets = [load_packet(args.input / f"seed{seed}.json.gz") for seed in SEEDS]
    args.output.mkdir(parents=True, exist_ok=True)
    run_scales = plot_run_summaries(packets, args.output)
    timeline_scales = plot_timelines(packets, args.output)
    lifetime_scale = plot_lifetimes(packets, args.output)
    metadata = {
        "schemaVersion": 1,
        "inputs": ["summary.json", *[f"seed{seed}.json.gz" for seed in SEEDS]],
        "outputs": ["run-summaries.png", "one-second-timelines.png", "completed-lifetimes.png"],
        "interpretation": "Descriptive observed-versus-null plots only. Null bands are pointwise 10th–90th percentiles; no p-values or decision thresholds.",
        "scales": {
            "runSummaries": {"description": "Per-metric shared linear scale across all four windows, seeds, observed values, and individual null replicates; y floor is zero.", "yLimits": run_scales},
            "timelines": {"description": "Per-metric shared linear scale across seeds; y floor is zero. Bands are pointwise null p10–p90.", "yLimits": timeline_scales},
            "lifetimes": {"description": "All five facets share one linear normalized-frequency y scale. Generator lowerBoundsSeconds bins are equally spaced categories; bands are pointwise null p10–p90.", "yLimits": lifetime_scale}
        },
        "seedColors": {str(seed): color for seed, color in zip(SEEDS, COLORS)},
        "windowLabels": {"0.25": "transient", "1": "primary", "5": "memory sensitivity", "20": "memory sensitivity"},
    }
    (args.output / "plot-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
