#!/usr/bin/env python3
"""Fixed-scale descriptive plots for the S2c leave-one-seed-out comparison."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

SEEDS = [20261005, 20261006, 20261007]
MODELS = ['baseline', 'baselinePlusSocial', 'trainingShiftControl']
LABELS = ['Spatial baseline', 'Baseline + temporal', 'Training shift control']
COLORS = ['#647783', '#248c79', '#d07a35']
METRICS = [('rocAuc', 'ROC AUC (higher better)'), ('averagePrecision', 'Average precision (higher better)'),
           ('brier', 'Brier score (lower better)')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = json.loads((args.input / 'summary.json').read_text(encoding='utf-8'))
    if [seed['seed'] for seed in report['seeds']] != SEEDS:
        raise ValueError('Expected three natural seeds')
    args.output.mkdir(parents=True, exist_ok=True)
    rows = report['results']
    if len(rows) != 6:
        raise ValueError('Expected three folds for each of two predictor windows')
    for row in rows:
        for run in row['runs'].values():
            values = [run['metrics'][key] for key, _ in METRICS]
            if not np.all(np.isfinite(values)) or not run['model']['converged']:
                raise ValueError('Missing metric or unconverged fit')
            if sum(b['n'] for b in run['metrics']['calibration']) != run['metrics']['n']:
                raise ValueError('Calibration counts do not sum to held-out samples')
    fig, axes = plt.subplots(3, 2, figsize=(11, 9), constrained_layout=True)
    scales = {}
    for mi, (key, title) in enumerate(METRICS):
        high = 1.0 if key != 'brier' else max(0.25, np.ceil(max(
            row['runs'][name]['metrics'][key] for row in rows for name in MODELS) * 20) / 20)
        scales[key] = [0, float(high)]
        for wi, seconds in enumerate([1, 0.25]):
            ax = axes[mi, wi]
            selected = [next(r for r in rows if r['windowSeconds'] == seconds and r['heldOutSeed'] == seed) for seed in SEEDS]
            for index, name in enumerate(MODELS):
                ax.bar(np.arange(3) + (index - 1) * .23, [r['runs'][name]['metrics'][key] for r in selected],
                       width=.22, color=COLORS[index], label=LABELS[index])
            if key == 'averagePrecision':
                ax.scatter(np.arange(3), [r['runs']['baseline']['metrics']['prevalence'] for r in selected],
                           marker='_', s=180, color='black', label='Held-out prevalence')
            ax.set_ylim(0, high)
            ax.set_xticks(range(3), ['05', '06', '07'])
            ax.set_xlabel('Held-out natural seed (202610xx)')
            ax.set_title(f'{title}; {seconds:g} s predictor window', fontsize=10)
            ax.grid(axis='y', alpha=.2)
    axes[0, 0].legend(fontsize=8)
    axes[1, 0].legend(fontsize=8)
    fig.suptitle('S2c: one future 1 s merge target, leave-one-seed-out evaluation')
    fig.savefig(args.output / 'held-out-performance.png', dpi=160)
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(13, 4), constrained_layout=True)
    delta_scales = {}
    for ax, (key, title) in zip(axes, METRICS):
        multiplier = -1 if key == 'brier' else 1
        all_values = [multiplier * r[part][key] for r in rows for part in ['incremental', 'controlIncremental']]
        limit = max(.005, np.ceil(max(abs(v) for v in all_values) * 200) / 200)
        delta_scales[key] = [-float(limit), float(limit)]
        for wi, seconds in enumerate([1, .25]):
            for index, part in enumerate(['incremental', 'controlIncremental']):
                vals = [multiplier * next(r for r in rows if r['windowSeconds'] == seconds and r['heldOutSeed'] == seed)[part][key] for seed in SEEDS]
                ax.scatter(np.arange(3) + (wi * 2 + index - 1.5) * .12, vals, color=COLORS[index + 1],
                           marker='o' if wi == 0 else 's', label=f'{LABELS[index + 1]}, {seconds:g} s')
        ax.axhline(0, color='#444', linewidth=.8)
        ax.set_ylim(-limit, limit)
        ax.set_xticks(range(3), ['05', '06', '07'])
        ax.set_xlabel('Held-out natural seed (202610xx)')
        ax.set_title('Brier improvement (baseline minus model)' if key == 'brier' else f'{title.split(" (")[0]} change from baseline', fontsize=9)
        ax.grid(axis='y', alpha=.2)
    axes[0].legend(fontsize=7)
    fig.suptitle('Incremental changes: positive is better; no inferential error bars')
    fig.savefig(args.output / 'incremental-changes.png', dpi=160)
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(12, 4), constrained_layout=True)
    for ax, seed in zip(axes, SEEDS):
        row = next(r for r in rows if r['windowSeconds'] == 1 and r['heldOutSeed'] == seed)
        for index, name in enumerate(MODELS):
            bins = [b for b in row['runs'][name]['metrics']['calibration'] if b['n']]
            ax.plot([b['meanPrediction'] for b in bins], [b['eventFraction'] for b in bins],
                    marker='o', markersize=4, color=COLORS[index], label=LABELS[index])
        ax.plot([0, 1], [0, 1], '--', color='#777', linewidth=.8)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.set_xlabel('Mean predicted probability')
        ax.set_ylabel('Observed event fraction')
        ax.set_title(f'Seed {seed} (primary 1 s predictors)')
        ax.grid(alpha=.2)
    axes[0].legend(fontsize=7)
    fig.suptitle('Fixed 0.1-wide calibration bins; small-bin fractions are unstable')
    fig.savefig(args.output / 'calibration.png', dpi=160)
    plt.close(fig)
    metadata = {'schemaVersion': 1, 'inputs': ['summary.json'],
                'outputs': ['held-out-performance.png', 'incremental-changes.png', 'calibration.png'],
                'fixedScales': {'performance': scales, 'incremental': delta_scales, 'calibration': {'x': [0, 1], 'y': [0, 1]}},
                'checks': {'finiteMetrics': True, 'convergedFits': True, 'calibrationCounts': True},
                'interpretation': 'Descriptive three-seed held-out comparisons; frames are not independent replicates; no confidence intervals or thresholds.'}
    (args.output / 'plot-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
