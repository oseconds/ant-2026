#!/usr/bin/env python3
"""Deterministic fixed-scale plots for read-only W1 per-cell history evidence."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch

matplotlib.rcParams['svg.hashsalt'] = 'ant-w1-cell-history'

SEEDS = [20261005, 20261006, 20261007]
GRID = 96
CELLS = GRID * GRID
TARGETS = [120, 300, 480, 599.25]
CONDITIONS = ['baseline', 'candidate']
CLASS_CODES = {'direct': 1, 'inherited': 2, 'overlapping': 3}
CLASS_COLORS = ['#ffffff', '#4c78a8', '#f2a541', '#8064a2']
PROVENANCE_LEGEND = [Patch(facecolor=CLASS_COLORS[i], edgecolor='#666666', label=label)
                     for i, label in enumerate(('No history', 'Direct', 'Inherited', 'Overlapping'))]


def read_input(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    if data.get('schemaVersion') != 1 or [s.get('seed') for s in data.get('seeds', [])] != SEEDS:
        raise ValueError('expected schema v1 and three canonical seeds')
    for seed in data['seeds']:
        if set(CONDITIONS) - seed.keys():
            raise ValueError(f"seed {seed['seed']} missing baseline/candidate")
        for condition in CONDITIONS:
            row = seed[condition]
            snaps = row.get('dominantSnapshots', [])
            if [float(s['nominalTargetSeconds']) for s in snaps] != TARGETS:
                raise ValueError(f"seed {seed['seed']} {condition}: expected four canonical snapshots")
            for snap in snaps:
                validate_snapshot(snap)
            for episode in row.get('frozenEpisodes', []):
                validate_snapshot(episode)
    return data


def validate_snapshot(snapshot):
    for key in ('historicalCellIndices', 'activeCellIndices', 'currentActiveCellCount', 'cells'):
        if key not in snapshot:
            raise ValueError(f'snapshot missing required {key}')
    for key in ('historicalCellIndices', 'activeCellIndices'):
        values = snapshot[key]
        if any(not isinstance(i, int) or i < 0 or i >= CELLS for i in values):
            raise ValueError(f'{key} contains invalid 96x96 cell index')
        if len(values) != len(set(values)):
            raise ValueError(f'{key} contains duplicate cells')
    if len(snapshot['activeCellIndices']) != snapshot['currentActiveCellCount']:
        raise ValueError('activeCellIndices does not match currentActiveCellCount')
    seen = set()
    for cell in snapshot.get('cells', []):
        i = cell.get('cellIndex')
        if not isinstance(i, int) or i < 0 or i >= CELLS:
            raise ValueError('cell record has invalid 96x96 index')
        if i in seen:
            raise ValueError(f'duplicate per-cell record at {i}')
        seen.add(i)
        for key in ('episodeOwnedActiveDuty', 'chemicalDuty', 'mechanicalDuty', 'jointSupportDuty'):
            value = cell.get(key)
            if value is not None and (not np.isfinite(float(value)) or not 0 <= float(value) <= 1):
                raise ValueError(f'{key} outside [0,1] at cell {i}')
        age = cell.get('episodeOwnedLastActiveAgeSeconds')
        if age is not None and (not np.isfinite(float(age)) or not 0 <= float(age) <= 600):
            raise ValueError(f'last-active age outside [0,600] at cell {i}')
        provenance = cell.get('provenanceClass')
        if provenance is not None and provenance not in CLASS_CODES:
            raise ValueError(f'unknown provenance class {provenance}')


def cell_field(snapshot, key, default=np.nan):
    field = np.full(CELLS, default, dtype=float)
    for row in snapshot.get('cells', []):
        value = row.get(key)
        if value is not None:
            field[row['cellIndex']] = float(value)
    return field.reshape(GRID, GRID)


def mask_field(indices):
    field = np.zeros(CELLS, dtype=float)
    if indices:
        field[np.asarray(indices, dtype=int)] = 1
    return field.reshape(GRID, GRID)


def provenance_field(snapshot):
    field = np.zeros(CELLS, dtype=float)
    for row in snapshot.get('cells', []):
        group = row.get('provenanceClass')
        if group in CLASS_CODES:
            field[row['cellIndex']] = CLASS_CODES[group]
    return field.reshape(GRID, GRID)


def world_axes(ax):
    ax.set(xlim=(0, 1), ylim=(0, 1), xlabel='World x', ylabel='World y')
    ax.set_aspect('equal', adjustable='box')
    ax.set_xticks([0, .25, .5, .75, 1])
    ax.set_yticks([0, .25, .5, .75, 1])


def draw(ax, field, title, vmin=0, vmax=1, cmap='viridis', discrete=False):
    if discrete:
        colors = ListedColormap(CLASS_COLORS)
        ax.imshow(field, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                  vmin=0, vmax=3, cmap=colors)
    else:
        masked = np.ma.masked_invalid(field)
        cmap_obj = plt.get_cmap(cmap).copy()
        cmap_obj.set_bad('white')
        ax.imshow(masked, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                  vmin=vmin, vmax=vmax, cmap=cmap_obj)
    ax.set_title(title, fontsize=8)
    world_axes(ax)


def save(fig, out, stem):
    fig.savefig(out / f'{stem}.png', dpi=160, metadata={'Software': 'ant-w1-cell-history-plots'})
    fig.savefig(out / f'{stem}.svg', metadata={'Date': None, 'Creator': 'ant-w1-cell-history-plots'})
    plt.close(fig)


def plot_dominant(seed_id, condition, row, out):
    snapshots = row['dominantSnapshots']
    fig, axes = plt.subplots(3, 4, figsize=(12, 9), constrained_layout=True)
    for col, snap in enumerate(snapshots):
        t = float(snap['nominalTargetSeconds'])
        draw(axes[0, col], mask_field(snap['historicalCellIndices']), f'{t:g}s historical footprint', 0, 1, 'Greys')
        draw(axes[1, col], provenance_field(snap), f'{t:g}s provenance class', discrete=True)
        draw(axes[2, col], mask_field(snap['activeCellIndices']), f'{t:g}s active cells', 0, 1, 'Greys')
    axes[0, 0].set_ylabel('Historical\nfootprint')
    axes[1, 0].set_ylabel('History\nprovenance')
    axes[2, 0].set_ylabel('Current active\ngeometry')
    fig.legend(handles=PROVENANCE_LEGEND, loc='outside lower center', ncol=4, fontsize=8)
    fig.suptitle(f'W1 dominant pending ID 0 · seed {seed_id} · {condition}')
    save(fig, out, f'dominant-{seed_id}-{condition}-geometry')

    fig, axes = plt.subplots(5, 4, figsize=(12, 15), constrained_layout=True)
    metrics = [
        ('episodeOwnedActiveDuty', 'Episode-owned active duty', 0, 1, 'viridis'),
        ('episodeOwnedLastActiveAgeSeconds', 'Last active age (s)', 0, 600, 'viridis'),
        ('chemicalDuty', 'Chemical support duty', 0, 1, 'viridis'),
        ('mechanicalDuty', 'Mechanical support duty', 0, 1, 'viridis'),
        ('jointSupportDuty', 'Joint support duty', 0, 1, 'viridis'),
    ]
    for r, (key, label, low, high, cmap) in enumerate(metrics):
        for col, snap in enumerate(snapshots):
            t = float(snap['nominalTargetSeconds'])
            draw(axes[r, col], cell_field(snap, key), f'{t:g}s {label}', low, high, cmap)
        axes[r, 0].set_ylabel(label)
    save(fig, out, f'dominant-{seed_id}-{condition}-activity-support')


def representative_snapshots(row):
    episodes = row.get('frozenEpisodes', [])
    ids = row.get('representativeIds', {})
    out = []
    for role in ('largestMultiCell', 'firstOneCell', 'zeroConsolidationOneCell'):
        episode_id = ids.get(role)
        if episode_id is None:
            continue
        matches = [ep for ep in episodes if ep.get('episodeMeta', {}).get('id') == episode_id
                   or ep.get('summary', {}).get('episodeId') == episode_id]
        if len(matches) != 1:
            raise ValueError(f'representative {role} ID {episode_id} resolves to {len(matches)} episodes')
        out.append((role, episode_id, matches[0]))
    return out


def plot_representatives(seed_id, condition, row, out, selected):
    reps = representative_snapshots(row)
    selected[f'{seed_id}-{condition}'] = {role: eid for role, eid, _ in reps}
    if not reps:
        return
    metrics = [('historicalCellIndices', 'Historical footprint', 0, 1, 'Greys'),
               ('provenanceClass', 'Direct / inherited / overlap', None, None, None),
               ('episodeOwnedActiveDuty', 'Episode-owned active duty', 0, 1, 'viridis'),
               ('episodeOwnedLastActiveAgeSeconds', 'Last owned-active age (s)', 0, 600, 'viridis'),
               ('chemicalDuty', 'Chemical support duty', 0, 1, 'viridis'),
               ('mechanicalDuty', 'Mechanical support duty', 0, 1, 'viridis'),
               ('jointSupportDuty', 'Joint support duty', 0, 1, 'viridis')]
    fig, axes = plt.subplots(len(metrics), len(reps), figsize=(4 * len(reps), 19), squeeze=False, constrained_layout=True)
    for col, (role, eid, episode) in enumerate(reps):
        for r, (key, label, low, high, cmap) in enumerate(metrics):
            if key == 'historicalCellIndices':
                field = mask_field(episode['historicalCellIndices'])
                draw(axes[r, col], field, f'{role} · ID {eid}\n{label}', low, high, cmap)
            elif key == 'provenanceClass':
                draw(axes[r, col], provenance_field(episode), f'{role} · ID {eid}\n{label}', discrete=True)
            else:
                draw(axes[r, col], cell_field(episode, key), f'{role} · ID {eid}\n{label}', low, high, cmap)
    fig.suptitle(f'W1 frozen representatives · seed {seed_id} · {condition} · full 96×96 world')
    fig.legend(handles=PROVENANCE_LEGEND, loc='outside lower center', ncol=4, fontsize=8)
    save(fig, out, f'representatives-{seed_id}-{condition}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='read-only analysis.json.gz')
    parser.add_argument('--output', required=True, type=Path, help='plot output directory')
    args = parser.parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(f'missing analysis artifact: {args.input}')
    data = read_input(args.input)
    args.output.mkdir(parents=True, exist_ok=True)
    selected = {}
    for seed in data['seeds']:
        for condition in CONDITIONS:
            row = seed[condition]
            plot_dominant(seed['seed'], condition, row, args.output)
            plot_representatives(seed['seed'], condition, row, args.output, selected)
    outputs = sorted(p for p in args.output.iterdir() if p.suffix in ('.png', '.svg'))
    manifest = {'schemaVersion': 1,
                'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                'plotterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'analyzedSeeds': SEEDS, 'conditions': CONDITIONS, 'grid': [GRID, GRID],
                'sourceSha256': data.get('sourceSha256', {}),
                'sourceEvidenceSha256': data.get('sourceEvidenceSha256', {}),
                'inputProvenance': {str(seed['seed']): seed.get('inputProvenance', {}) for seed in data['seeds']},
                'worldLimits': [0, 1], 'checkpointTargetsSeconds': TARGETS,
                'fixedScales': {'duty': [0, 1], 'lastActiveAgeSeconds': [0, 600]},
                'selectedEpisodeIds': selected,
                'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs},
                'limits': ['Archived observations only; no activity is interpolated between observations.',
                           'Support duties are formation-history proxies, not physical contribution quantities.',
                           'No exact DAB deposition history is reconstructed.']}
    (args.output / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
