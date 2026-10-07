#!/usr/bin/env python3
"""Plot descriptive S2b exact-spatial-movie identity-null packets."""
import argparse
import importlib.util
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


SEEDS = (20261005, 20261006, 20261007)
WINDOWS = (0.25, 1, 5, 20)
PHASE_WINDOWS = (0.25, 1)
COLORS = ("#2878b5", "#e07a24", "#3a9d5d")
IDENTITY = "ANT-S2b-2026-10-08-identity-v1"

_spec = importlib.util.spec_from_file_location(
    "ant_social_null_plots", Path(__file__).with_name("ant-social-null-plots.py"))
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
load_packet, window = _base.load_packet, _base.window
assert_finite, plot_lifetimes = _base.assert_finite, _base.plot_lifetimes

METRICS = (
    ("rollingEdges", "Mean rolling edge count", lambda run, w: window(run, w)["metrics"]["edgeCount"]["mean"]),
    ("weightedDegree", "Mean weighted degree (s)", lambda run, w: window(run, w)["metrics"]["weightedDegree"]["mean"]),
    ("rawCount", "Raw encounter count", lambda run, w: run["raw"]["lifetimes"]["count"]),
    ("rawCompletedMean", "Raw completed mean lifetime (s)", lambda run, w: run["raw"]["lifetimes"]["completed"]["mean"]),
    ("temporalCompletedMean", "Temporal-edge completed mean lifetime (s)", lambda run, w: window(run, w)["temporalEdgeLifetimes"]["completed"]["mean"]),
    ("bridgePersist", "Bridge PERSIST events", lambda run, w: window(run, w)["eventCounts"].get("BRIDGE_PERSIST", 0)),
    ("articulationPersist", "Articulation PERSIST events", lambda run, w: window(run, w)["eventCounts"].get("ARTICULATION_PERSIST", 0)),
    ("connectorPersist", "Connector PERSIST events", lambda run, w: window(run, w)["eventCounts"].get("CONNECTOR_PERSIST", 0)),
    ("merge", "Component merges", lambda run, w: window(run, w)["eventCounts"].get("COMPONENT_MERGE", 0)),
    ("split", "Component splits", lambda run, w: window(run, w)["eventCounts"].get("COMPONENT_SPLIT", 0)),
)


def validate(packets):
    for packet in packets:
        if packet.get("parameters", {}).get("family") != "exact-spatial-movie identity permutation":
            raise ValueError(f"Not an S2b identity-null packet: seed {packet.get('seed')}")
        if not packet.get("observed") or not packet.get("nulls"):
            raise ValueError(f"Packet lacks observed/null runs: seed {packet['seed']}")
        n = len(packet["nulls"])
        if n > 8:
            raise ValueError(f"S2b pilot cap exceeded: seed {packet['seed']} has {n} runs")
        reference_times = None
        for run in [packet["observed"], *packet["nulls"]]:
            for seconds in WINDOWS:
                window(run, seconds)
            if len(run["timeline"]) < 2:
                raise ValueError(f"Timeline too short: seed {packet['seed']}")
            times = np.asarray([row["seconds"] for row in run["timeline"]], dtype=float)
            assert_finite(times, f"timeline times seed {packet['seed']}")
            if not np.allclose(np.diff(times), 1.0):
                raise ValueError(f"Expected 1 Hz timeline cadence: seed {packet['seed']}")
            if reference_times is None:
                reference_times = times
            elif not np.array_equal(times, reference_times):
                raise ValueError(f"Timeline timestamps differ within seed {packet['seed']}")
        for run in packet["nulls"]:
            matched = run.get("boundary", {}).get("matchedRollingSamples", [])
            if not matched:
                raise ValueError(f"Missing matched boundary samples: seed {packet['seed']}")


def run_summaries(packets, out):
    fig, axes = plt.subplots(5, 2, figsize=(12, 12), constrained_layout=True)
    scales = {}
    for ax, (key, title, measure) in zip(axes.flat, METRICS):
        all_values = []
        for si, packet in enumerate(packets):
            color = COLORS[si]
            for wi, seconds in enumerate(WINDOWS):
                vals = np.asarray([measure(run, seconds) for run in packet["nulls"]], dtype=float)
                observed = np.asarray([measure(packet["observed"], seconds)], dtype=float)
                assert_finite(vals, f"{key} null seed {packet['seed']} window {seconds}")
                assert_finite(observed, f"{key} observed seed {packet['seed']} window {seconds}")
                all_values.extend(vals.tolist()); all_values.extend(observed.tolist())
                x = wi + (si - 1) * 0.18
                ax.scatter(np.full(len(vals), x), vals, s=9, alpha=0.3, color=color,
                           linewidths=0, rasterized=True)
                ax.scatter([x], observed, marker="D", s=24, color=color,
                           edgecolors="black", linewidths=0.35, zorder=4)
        high = max(max(all_values, default=0) * 1.05, 1.0)
        ax.set_ylim(0, high)
        scales[key] = [0.0, high]
        ax.set_title(title, fontsize=9)
        ax.set_xticks(range(4), ["0.25", "1", "5", "20"])
        ax.grid(axis="y", alpha=0.2)
        ax.tick_params(labelsize=8)
    fig.supxlabel("Topology window (s); 1 s primary, 0.25 s transient, 5/20 s sensitivity")
    fig.suptitle("S2b identity null: observed diamonds and individual null runs", fontsize=12)
    fig.legend([plt.Line2D([], [], marker="o", linestyle="", color=c) for c in COLORS],
               [str(p["seed"]) for p in packets], loc="upper right", bbox_to_anchor=(1.12, 1),
               title="Seed", fontsize=8)
    fig.savefig(out / "run-summaries.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return scales


def timelines(packets, out):
    keys = (("edgeCount", "Rolling edge count"), ("weightedDegreeMean", "Mean weighted degree (s)"))
    fig, axes = plt.subplots(2, 3, figsize=(14, 6), sharex="col", constrained_layout=True)
    for si, packet in enumerate(packets):
        observed_timeline = packet["observed"]["timeline"]
        times = np.asarray([row["seconds"] for row in observed_timeline], dtype=float)
        for mi, (key, title) in enumerate(keys):
            ax = axes[mi, si]
            obs = np.asarray([next(w[key] for w in row["windows"] if w["windowSeconds"] == 1)
                                for row in observed_timeline], dtype=float)
            runs = [run["timeline"] for run in packet["nulls"]]
            matrix = np.asarray([[next(w[key] for w in row["windows"] if w["windowSeconds"] == 1)
                                  for row in timeline] for timeline in runs], dtype=float)
            assert_finite(obs, f"observed timeline {key} seed {packet['seed']}")
            assert_finite(matrix, f"null timeline {key} seed {packet['seed']}")
            lo, median, hi = np.percentile(matrix, [10, 50, 90], axis=0)
            ax.fill_between(times, lo, hi, color="#8795a1", alpha=0.28)
            ax.plot(times, median, color="#5b6872", linewidth=0.75)
            ax.plot(times, obs, color="#b33a3a", linewidth=0.8)
            ax.set_title(f"Seed {packet['seed']}" if mi == 0 else "", fontsize=9)
            if si == 0:
                ax.set_ylabel(title, fontsize=8)
            if mi == 1:
                ax.set_xlabel("Time (s)", fontsize=8)
            ax.grid(alpha=0.18); ax.tick_params(labelsize=7)
    scales = {}
    for mi, (key, _) in enumerate(keys):
        high = max(ax.get_ylim()[1] for ax in axes[mi])
        for ax in axes[mi]:
            ax.set_ylim(0, high)
        scales[key] = [0.0, float(high)]
    fig.legend([plt.Line2D([], [], color="#b33a3a"), plt.Line2D([], [], color="#5b6872"),
                plt.Rectangle((0, 0), 1, 1, color="#8795a1", alpha=0.28)],
               ["Observed", "Null median", "Null 10th–90th percentile"],
               loc="lower center", bbox_to_anchor=(0.5, -0.04), ncol=3, fontsize=8)
    fig.suptitle("S2b identity null: 1 s rolling topology timelines", fontsize=12)
    fig.savefig(out / "one-second-timelines.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return scales


def boundary_phase(packets, out):
    metrics = (("edgeCountDelta", "Rolling edge-count delta"),
               ("weightedDegreePooledDelta", "Pooled weighted-degree delta (s)"))
    phase = np.arange(20) * 0.25
    series = {}
    max_abs = {key: 0.0 for key, _ in metrics}
    for key, _ in metrics:
        series[key] = {}
        for seconds in PHASE_WINDOWS:
            series[key][seconds] = []
            for packet in packets:
                matching = [next(item for item in run["boundary"]["matchedRollingSamples"]
                                 if item["windowSeconds"] == seconds)["scheduledBoundaryPhaseBins"]
                            for run in packet["nulls"]]
                if any(len(bins) != len(phase) or not np.array_equal(
                        [row["phaseStartSeconds"] for row in bins], phase) for bins in matching):
                    raise ValueError(f"Unexpected boundary phase bins: seed {packet['seed']}, window {seconds}")
                matrix = np.asarray([[row[key] for row in bins] for bins in matching], dtype=float)
                assert_finite(matrix, f"boundary phase {key}, seed {packet['seed']}, window {seconds}")
                series[key][seconds].append((packet["seed"], matrix))
                max_abs[key] = max(max_abs[key], float(np.max(np.abs(matrix))))
    fig, axes = plt.subplots(2, 2, figsize=(12, 7), sharex=True, constrained_layout=True)
    scales = {}
    for mi, (key, title) in enumerate(metrics):
        for wi, seconds in enumerate(PHASE_WINDOWS):
            ax = axes[mi, wi]
            for si, (seed, matrix) in enumerate(series[key][seconds]):
                for row in matrix:
                    ax.plot(phase, row, color=COLORS[si], alpha=0.22, linewidth=0.65)
                ax.plot(phase, np.mean(matrix, axis=0), color=COLORS[si], linewidth=1.5,
                        label=str(seed))
            limit = max(max_abs[key] * 1.05, 1e-6)
            ax.set_ylim(-limit, limit)
            ax.axhline(0, color="#444", linewidth=0.6)
            ax.set_title(f"{title}, {seconds:g} s rolling window")
            ax.grid(alpha=0.2); ax.tick_params(labelsize=8)
            if wi == 0:
                ax.set_ylabel("Null minus observed mean")
            if mi == 1:
                ax.set_xlabel("Seconds after scheduled identity remap")
        scales[key] = [-max(max_abs[key] * 1.05, 1e-6), max(max_abs[key] * 1.05, 1e-6)]
    axes[0, 0].legend(title="Seed", fontsize=8)
    fig.suptitle("S2b identity null: rolling metrics after scheduled remaps", fontsize=12)
    fig.savefig(out / "scheduled-boundary-phase-deltas.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return scales


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    summary = json.loads((args.input / "summary.json").read_text(encoding="utf-8"))
    seeds = [item["seed"] for item in summary.get("seeds", [])]
    if seeds != list(SEEDS):
        raise ValueError(f"Expected seeds {SEEDS}, got {seeds}")
    packets = [load_packet(args.input / f"seed{seed}.json.gz") for seed in SEEDS]
    validate(packets)
    args.output.mkdir(parents=True, exist_ok=True)
    run_scales = run_summaries(packets, args.output)
    timeline_scales = timelines(packets, args.output)
    phase_scales = boundary_phase(packets, args.output)
    lifetime_scale = plot_lifetimes(packets, args.output)
    metadata = {
        "schemaVersion": 1,
        "identity": IDENTITY,
        "inputs": ["summary.json", *[f"seed{seed}.json.gz" for seed in SEEDS]],
        "outputs": ["run-summaries.png", "one-second-timelines.png", "scheduled-boundary-phase-deltas.png", "completed-lifetimes.png"],
        "interpretation": "Descriptive observed-versus-null plots only. Null runs are individual packet runs; bands are descriptive, with no p-values or thresholds.",
        "checks": {"allPlottedValuesFinite": True, "timelineCadenceSeconds": 1, "timelineCadenceChecked": True,
                   "maximumNullRunsPerSeed": 8, "phaseBinWidthSeconds": 0.25, "phaseBins": 20},
        "scales": {
            "runSummaries": {"description": "Per-metric shared linear scale across seeds, all four windows, observed values and null runs; zero floor.", "yLimits": run_scales},
            "timelines": {"description": "Per-metric shared linear scale across seeds; 1 s window only.", "yLimits": timeline_scales},
            "boundaryPhase": {"description": "Per-metric symmetric linear scale shared across seeds and 0.25/1 s windows.", "yLimits": phase_scales},
            "lifetimes": {"description": "Shared normalized-frequency scale; generator bins are equally spaced categories.", "yLimits": lifetime_scale},
        },
        "seedColors": {str(seed): color for seed, color in zip(SEEDS, COLORS)},
        "windowLabels": {"0.25": "transient", "1": "primary", "5": "sensitivity", "20": "sensitivity"},
    }
    (args.output / "plot-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
