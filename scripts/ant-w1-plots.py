#!/usr/bin/env python3
"""Deterministic fixed-scale plots for the detached W1 analysis artifact."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams['svg.hashsalt'] = 'ant-w1-episodic-material-shadow'

SEEDS = [20261005, 20261006, 20261007]
GRID = 96
CELLS = GRID * GRID
LIMITS = (0.0, 1.0)
COLORS = ['#267b9b', '#d17a32', '#8064a2']


def read_input(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    seed_ids = [seed.get('seed') for seed in data.get('seeds', [])]
    if (data.get('schemaVersion') != 1 or data.get('status') != 'stopped-data-gap'
            or not seed_ids or seed_ids != SEEDS[:len(seed_ids)]):
        raise ValueError('expected stopped-data-gap W1 schema v1 with a canonical analyzed seed prefix')
    if [row.get('seed') for row in data.get('baselineMilestones', [])] != SEEDS:
        raise ValueError('expected three canonical historical baseline seeds')
    for seed in data['seeds']:
        if seed.get('status') != 'stopped-data-gap' or not seed.get('dataGap') or not seed.get('stopSnapshot'):
            raise ValueError(f'missing explicit data-gap stop record for seed {seed.get("seed")}')
        for ep in seed['episodes']:
            if not all(np.isfinite(ep['character'][k]) and 0 <= ep['character'][k] <= 1
                       for k in ('consolidation', 'directionalOrder')):
                raise ValueError(f'invalid character values: seed {seed["seed"]}, episode {ep["id"]}')
            if any(i < 0 or i >= CELLS for i in ep['cellIndices']):
                raise ValueError(f'episode index outside fixed {GRID}x{GRID} grid')
    return data


def save(fig, out, stem):
    fig.savefig(out / f'{stem}.png', dpi=160, metadata={'Software': 'ant-w1-plots'})
    fig.savefig(out / f'{stem}.svg', metadata={'Date': None, 'Creator': 'ant-w1-plots'})
    plt.close(fig)


def world_axes(ax):
    ax.set(xlim=LIMITS, ylim=LIMITS, xlabel='World x', ylabel='World y')
    ax.set_aspect('equal', adjustable='box')


def plot_timelines(data, out):
    if any(not seed['history'] for seed in data['seeds']):
        raise ValueError('analyzed W1 prefix must include recorded history')
    fig, axes = plt.subplots(2, 1, figsize=(10, 7), constrained_layout=True)
    for si, seed in enumerate(data['seeds']):
        h = seed['history']
        t = np.array([row['timeSeconds'] for row in h], dtype=float)
        for key, label, style in [('frozenCells', 'Frozen W1 union', '-'),
                                  ('pendingCells', 'Pending at observed stop', '--'),
                                  ('productionCells', 'Production', ':'),
                                  ('localAccretionCells', 'Previous local accretion', '-.')]:
            axes[0].plot(t, [row[key] / CELLS for row in h], color=COLORS[si], linestyle=style,
                         alpha=.9, label=f'{seed["seed"]} {label}')
        axes[1].plot(t, [row['newFrozenCells'] / CELLS for row in h], color=COLORS[si],
                     label=str(seed['seed']))
    axes[0].set(xlabel='Simulation seconds', ylabel='Occupied world area fraction', ylim=(0, 1))
    axes[1].set(xlabel='Simulation seconds', ylabel='New frozen area fraction per observation', ylim=(0, 1))
    stop_time = min(seed['stopSnapshot']['sampledSeconds'] for seed in data['seeds'])
    for ax in axes:
        ax.set_xlim(0, stop_time); ax.axvline(stop_time, color='#555555', linestyle=':', linewidth=1)
        ax.grid(alpha=.2)
    axes[0].legend(ncol=2, fontsize=7)
    axes[1].legend(title='Analyzed seed', fontsize=8)
    analyzed = ', '.join(str(seed['seed']) for seed in data['seeds'])
    input_only = ', '.join(str(seed.get('seed')) for seed in data.get('inputOnlySeeds', [])) or 'none'
    fig.suptitle(f'W1 analyzed prefix only · DATA GAP at {stop_time:.3f}s · analyzed {analyzed}\n'
                 f'Input-only seeds (no W1 mechanism analysis): {input_only}')
    save(fig, out, 'area-and-formation-timeline')


def plot_checkpoints(data, out):
    reps = [('productionMask', 'Prior production'), ('shadowMask', 'Prior local-accretion shadow'),
            ('trafficMask', 'Archived traffic')]
    baselines = data['baselineMilestones']
    fig, axes = plt.subplots(3, 9, figsize=(15, 7), constrained_layout=True)
    for si, seed in enumerate(baselines):
        for ci, target in enumerate((120, 300, 600)):
            row = min(seed['milestones'], key=lambda m: abs(m['requestedSeconds'] - target))
            if abs(row['requestedSeconds'] - target) > 1e-9:
                raise ValueError(f'missing historical {target}s milestone for seed {seed["seed"]}')
            for ri, (key, label) in enumerate(reps):
                ax = axes[si, ci * 3 + ri]
                mask = np.asarray(row[key], dtype=np.uint8)
                if mask.size != CELLS:
                    raise ValueError(f'invalid historical {key} mask at {seed["seed"]}/{target}s')
                ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                          interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
                world_axes(ax)
                ax.set_title(f'{seed["seed"]} · {row["sampledSeconds"]:g}s\n{label}', fontsize=6)
                ax.tick_params(labelsize=5)
    fig.suptitle('Historical baseline masks only · W1 unavailable · fixed world scale [0,1] × [0,1]')
    save(fig, out, 'historical-baseline-masks')


def plot_fields(data, out):
    fields = [('chemicalMemory', 'Chemical memory'),
              ('mechanicalSupport', 'Mechanical support')]
    fig, axes = plt.subplots(3, 6, figsize=(12, 7), constrained_layout=True)
    for si, seed in enumerate(data['baselineMilestones']):
        for ci, target in enumerate((120, 300, 600)):
            row = min(seed['milestones'], key=lambda m: abs(m['requestedSeconds'] - target))
            if abs(row['requestedSeconds'] - target) > 1e-9:
                raise ValueError(f'missing historical {target}s field for seed {seed["seed"]}')
            for fi, (key, label) in enumerate(fields):
                ax = axes[si, ci * 2 + fi]
                values = np.asarray(row[key], dtype=float)
                if values.size != CELLS or not np.isfinite(values).all() or np.any((values < 0) | (values > 1)):
                    raise ValueError(f'invalid normalized {key} field for seed {seed["seed"]} at {target}s')
                image = ax.imshow(values.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                                  interpolation='nearest', vmin=0, vmax=1, cmap='viridis')
                world_axes(ax)
                ax.set_title(f'{seed["seed"]} · {row["sampledSeconds"]:g}s\n{label}', fontsize=7)
                ax.tick_params(labelsize=6)
    fig.colorbar(image, ax=axes, shrink=.72, label='Fixed field scale [0,1]')
    fig.suptitle('Historical baseline chemical-memory and mechanical-support fields; W1 unavailable; fixed [0,1]')
    save(fig, out, 'historical-baseline-fields')


def plot_character(data, out):
    fig, ax = plt.subplots(figsize=(6, 5), constrained_layout=True)
    for si, seed in enumerate(data['seeds']):
        rows = seed['episodes']
        if rows:
            ax.scatter([r['character']['consolidation'] for r in rows],
                       [r['character']['directionalOrder'] for r in rows],
                       s=20, alpha=.72, color=COLORS[si], label=str(seed['seed']))
    ax.set(xlim=LIMITS, ylim=LIMITS, xlabel='Consolidation', ylabel='Directional order')
    ax.grid(alpha=.2)
    if any(seed['episodes'] for seed in data['seeds']):
        ax.legend(title='Seed')
    else:
        ax.text(.5, .5, 'No valid frozen episodes before data-gap stop', ha='center', va='center', transform=ax.transAxes)
    fig.suptitle('W1 prefix character · N=0 at data-gap stop' if not any(seed['episodes'] for seed in data['seeds'])
                 else 'W1 prefix character · pass stopped at data gap')
    save(fig, out, 'character-coordinates')

    fig, axes = plt.subplots(len(data['seeds']), 2, figsize=(9, 3.2 * len(data['seeds'])), squeeze=False,
                             constrained_layout=True)
    for si, seed in enumerate(data['seeds']):
        for ai, (key, label) in enumerate((('consolidation', 'Consolidation'),
                                           ('directionalOrder', 'Directional order'))):
            ax = axes[si, ai]
            values = np.sort([r['character'][key] for r in seed['episodes']])
            if len(values):
                ax.hist(values, bins=np.linspace(0, 1, 11), color=COLORS[si], alpha=.55,
                        edgecolor='white', density=True, label='10-bin density')
                ax.set_ylim(bottom=0, top=max(1, ax.get_ylim()[1]))
                # ECDF uses its own right axis; both coordinate axes remain fixed to [0,1].
                twin = ax.twinx()
                twin.step(values, np.arange(1, len(values) + 1) / len(values), where='post',
                          color='#222222', linewidth=1, label='ECDF')
                twin.set_ylim(0, 1); twin.set_ylabel('ECDF')
            else:
                ax.text(.5, .5, 'No frozen episodes', ha='center', va='center', transform=ax.transAxes)
            ax.set(xlim=LIMITS, xlabel=label, ylabel='Density')
            ax.set_title(f'{seed["seed"]} · n={len(values)}')
            ax.grid(alpha=.15)
    fig.suptitle('Analyzed-prefix distributions only; pass stopped at data gap; fixed coordinate range [0,1]')
    save(fig, out, 'character-distributions')


def plot_episodes(data, out):
    selected = []
    for si, seed in enumerate(data['seeds']):
        episodes = seed['episodes']
        if not episodes:
            selected.append({'seed': seed['seed'], 'selection': 'none', 'reason': 'no valid frozen episodes before stop'})
            fig, ax = plt.subplots(figsize=(4, 3.5), constrained_layout=True)
            ax.text(.5, .5, 'No valid frozen episodes before data-gap stop', ha='center', va='center', transform=ax.transAxes)
            ax.set_axis_off()
            fig.suptitle(f'Analyzed prefix only · seed {seed["seed"]}')
            save(fig, out, f'episodes-seed{seed["seed"]}')
            continue
        choices = [('smallest area', min(episodes, key=lambda e: (e['occupiedCells'], e['id']))),
                   ('largest area', max(episodes, key=lambda e: (e['occupiedCells'], -e['id']))),
                   ('lowest consolidation', min(episodes, key=lambda e: (e['character']['consolidation'], e['id']))),
                   ('highest directional order', max(episodes, key=lambda e: (e['character']['directionalOrder'], -e['id'])))]
        unique = []
        for label, episode in choices:
            if all(ep['id'] != episode['id'] for _, ep in unique):
                unique.append((label, episode))
        selected.extend({'seed': seed['seed'], 'id': ep['id'], 'selection': label,
                         'areaCells': ep['occupiedCells'], 'areaFraction': ep['areaFraction']}
                        for label, ep in unique)
        fig, axes = plt.subplots(1, len(unique), figsize=(3.4 * len(unique), 3.8), squeeze=False,
                                 constrained_layout=True)
        for ax, (label, ep) in zip(axes[0], unique):
            mask = np.zeros(CELLS, dtype=np.uint8); mask[np.asarray(ep['cellIndices'], dtype=int)] = 1
            ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                      interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
            world_axes(ax)
            ax.set_title(f'{label}\nepisode {ep["id"]} · {ep["occupiedCells"]} cells', fontsize=8)
        fig.suptitle(f'Actual valid frozen geometry from analyzed prefix · seed {seed["seed"]}')
        save(fig, out, f'episodes-seed{seed["seed"]}')
    return selected


def plot_stop_snapshot(seed, data_gap, out):
    snapshot = seed['stopSnapshot']
    reps = [('frozen', 'W1 frozen union'), ('pending', 'Pending at stop'), ('active', 'Active at stop'),
            ('traffic20s', 'Actual traffic, trailing 20s'), ('unresolvedEpisode', 'Unresolved episode at data gap')]
    fig, axes = plt.subplots(1, len(reps), figsize=(13, 3.8), constrained_layout=True)
    for ax, (key, label) in zip(axes, reps):
        mask = np.asarray(snapshot['masks'][key], dtype=np.uint8)
        if mask.size != CELLS or not np.isin(mask, (0, 1)).all():
            raise ValueError(f'invalid stop-snapshot mask {key}')
        ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                  interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
        if key == 'unresolvedEpisode':
            indices = np.flatnonzero(mask)
            if not len(indices):
                raise ValueError('data-gap snapshot has no unresolved episode geometry')
            ax.scatter((indices % GRID) / (GRID - 1), (indices // GRID) / (GRID - 1),
                       marker='x', s=45, linewidths=1.5, color='#c43b35', label='recorded unresolved cells')
            ax.legend(loc='upper right', fontsize=6)
        world_axes(ax)
        ax.set_title(f'{label}\n{int(mask.sum())} cells', fontsize=7)
        ax.tick_params(labelsize=5)
    fig.suptitle(f'Actual W1 prefix stop snapshot · seed {seed["seed"]} · {snapshot["sampledSeconds"]:.3f}s · DATA GAP')
    save(fig, out, f'stop-snapshot-seed{seed["seed"]}')
    return {'seed': seed['seed'], 'sampledSeconds': snapshot['sampledSeconds'],
            'dataGap': {'code': data_gap['code'], 'timeSeconds': data_gap['timeSeconds'],
                        'episodeId': data_gap['episode']['id'], 'episodeCells': len(data_gap['episode']['cellIndices']),
                        'candidateFeet': data_gap['details']['candidateFeet'],
                        'missingDirectionFeet': data_gap['details']['missingDirectionFeet']},
            'metrics': {key: {'occupiedCellCount': value['occupiedCellCount'],
                              'areaFraction': value['areaFraction']}
                        for key, value in snapshot['metrics'].items()},
            'maskCellCounts': {key: int(np.asarray(snapshot['masks'][key]).sum()) for key, _ in reps}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='analysis.json.gz from W1 analysis')
    parser.add_argument('--output', required=True, type=Path, help='plot output directory')
    args = parser.parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(f'missing W1 analysis artifact: {args.input}')
    data = read_input(args.input)
    args.output.mkdir(parents=True, exist_ok=True)
    plot_timelines(data, args.output)
    plot_checkpoints(data, args.output)
    plot_fields(data, args.output)
    plot_character(data, args.output)
    selected = plot_episodes(data, args.output)
    stop_snapshots = [plot_stop_snapshot(seed, seed['dataGap'], args.output) for seed in data['seeds']]
    outputs = sorted(p for p in args.output.iterdir() if p.suffix in ('.png', '.svg'))
    manifest = {'schemaVersion': 1, 'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                'plotterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'status': data['status'], 'analyzedSeeds': [seed['seed'] for seed in data['seeds']],
                'inputOnlySeeds': [{'seed': seed['seed'], 'status': seed['status']}
                                   for seed in data.get('inputOnlySeeds', [])],
                'dataGaps': [{'seed': seed['seed'], 'dataGap': seed['dataGap']} for seed in data['seeds']],
                'stopSnapshots': stop_snapshots, 'worldLimits': [0, 1], 'grid': [GRID, GRID],
                'historicalBaselineTargetsSeconds': [120, 300, 600],
                'selectedActualEpisodes': selected,
                'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs},
                'interpretation': 'W1 analysis stopped at the first character data gap. Character and material plots show only the analyzed prefix; historical masks and fields are separate prior baselines, not W1. Unresolved geometry is the recorded stop snapshot, not a frozen episode.'}
    (args.output / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
