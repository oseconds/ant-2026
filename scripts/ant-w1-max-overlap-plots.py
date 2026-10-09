#!/usr/bin/env python3
"""Render deterministic, fixed-scale plots from paired W1 split-shadow analysis."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams['svg.hashsalt'] = 'ant-w1-max-overlap-split-shadow'

SEEDS = (20261005, 20261006, 20261007)
GRID = 96
CELLS = GRID * GRID
LIMITS = (0.0, 1.0)
COLORS = {'baseline': '#426b7a', 'candidate': '#bd7441'}
TARGETS = (120, 300, 599)


def read_input(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    seeds = data.get('seeds', [])
    if [row.get('seed') for row in seeds] != list(SEEDS):
        raise ValueError('expected paired analysis for canonical seeds 20261005/06/07')
    for row in seeds:
        if not row.get('matched', {}).get('frames'):
            raise ValueError(f'missing paired matched frames for seed {row["seed"]}')
        for condition in ('baseline', 'candidate'):
            result = row.get(condition)
            if not isinstance(result, dict) or not all(k in result for k in ('episodes', 'rightCensoredEpisodes', 'history', 'milestones')):
                raise ValueError(f'missing {condition} analyzeSeed result for seed {row["seed"]}')
            if not result['history'] or not result['milestones']:
                raise ValueError(f'empty {condition} history or milestones for seed {row["seed"]}')
    return data


def save(fig, out, stem):
    fig.savefig(out / f'{stem}.png', dpi=160, metadata={'Software': 'ant-w1-max-overlap-plots'})
    fig.savefig(out / f'{stem}.svg', metadata={'Date': None, 'Creator': 'ant-w1-max-overlap-plots'})
    plt.close(fig)


def world_axes(ax):
    ax.set(xlim=LIMITS, ylim=LIMITS, xlabel='World x', ylabel='World y')
    ax.set_aspect('equal', adjustable='box')


def mask_image(ax, values, title):
    mask = np.asarray(values, dtype=np.uint8)
    if mask.size != CELLS or not np.isin(mask, (0, 1)).all():
        raise ValueError(f'invalid recorded 96x96 binary mask: {title}')
    ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
              interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
    world_axes(ax)
    ax.set_title(title, fontsize=7)
    ax.tick_params(labelsize=5)


def milestones(result):
    return {int(round(m['sampledSeconds'])): m for m in result['milestones']}


def plot_morphology(data, out):
    selections = []
    row_specs = (('baseline', 'frozen'), ('baseline', 'pending'),
                 ('candidate', 'frozen'), ('candidate', 'pending'))
    for seed in data['seeds']:
        fig, axes = plt.subplots(4, len(TARGETS), figsize=(10, 10), squeeze=False,
                                 constrained_layout=True)
        for ti, target in enumerate(TARGETS):
            for ri, (condition, key) in enumerate(row_specs):
                by_time = milestones(seed[condition])
                if target not in by_time:
                    raise ValueError(f'missing recorded {target}s {condition} milestone for seed {seed["seed"]}')
                milestone = by_time[target]
                ax = axes[ri, ti]
                mask_image(ax, milestone['masks'][key], f'{milestone["sampledSeconds"]:g}s')
                if ri == 0:
                    ax.set_title(f'{milestone["sampledSeconds"]:g}s', fontsize=9)
                if ti == 0:
                    ax.set_ylabel(f'{condition.title()} {key}\nWorld y')
                selections.append({'seed': seed['seed'], 'condition': condition,
                                   'requestedSeconds': target, 'sampledSeconds': milestone['sampledSeconds'],
                                   'mask': key, 'occupiedCellCount': milestone['metrics'][key]['occupiedCellCount']})
        fig.suptitle(f'Seed {seed["seed"]} · recorded frozen and pending masks · exact 96×96 source geometry · world [0,1]')
        save(fig, out, f'paired-milestone-morphology-seed{seed["seed"]}')
    return selections


def plot_history(data, out):
    fig, axes = plt.subplots(len(SEEDS), 2, figsize=(14, 9), squeeze=False,
                             constrained_layout=True, sharex=True)
    count_axes = []
    dominant_max = max((frame[c]['dominant']['activeCells'] if frame[c]['dominant'] else 0)
                       for seed in data['seeds'] for frame in seed['matched']['frames']
                       for c in ('baseline', 'candidate'))
    episode_max = max(frame[c]['openEpisodes'] for seed in data['seeds']
                      for frame in seed['matched']['frames'] for c in ('baseline', 'candidate'))
    component_max = max(frame['activeComponents'] for seed in data['seeds']
                        for frame in seed['matched']['frames'])
    for si, seed in enumerate(data['seeds']):
        for condition in ('baseline', 'candidate'):
            rows = seed[condition]['history']
            t = [r['timeSeconds'] for r in rows]
            color = COLORS[condition]
            axes[si, 0].plot(t, [r['frozenCells'] / CELLS for r in rows], color=color,
                             label=f'{condition} frozen union')
            axes[si, 0].plot(t, [r['pendingCells'] / CELLS for r in rows], color=color,
                             linestyle='--', label=f'{condition} pending union')
        matched = seed['matched']['frames']
        t = [r['timeSeconds'] for r in matched]
        counts_ax = axes[si, 1].twinx()
        count_axes.append(counts_ax)
        for condition in ('baseline', 'candidate'):
            color = COLORS[condition]
            counts_ax.plot(t, [r[condition]['openEpisodes'] for r in matched], color=color,
                           label=f'{condition} open episodes', linestyle='--')
            axes[si, 1].plot(t, [r[condition]['dominant']['activeCells'] if r[condition]['dominant'] else 0
                                 for r in matched], color=color,
                             linestyle='-', label=f'{condition} dominant active cells')
        counts_ax.plot(t, [r['activeComponents'] for r in matched], color='#777777',
                       linestyle=':', alpha=.7, label='active components')
        axes[si, 0].set(ylabel=f'{seed["seed"]}\nUnion area fraction', ylim=(0, 1), xlim=(0, 600))
        axes[si, 1].set(ylabel='Dominant episode active cells', xlim=(0, 600))
        axes[si, 1].set_ylim(0, max(1, dominant_max * 1.05))
        counts_ax.set_ylabel('Open episodes / active components')
        counts_ax.set_ylim(0, max(1, max(episode_max, component_max) * 1.05))
        for ax in (axes[si, 0], axes[si, 1], counts_ax): ax.grid(alpha=.2)
    axes[0, 0].legend(fontsize=7, ncol=2)
    handles, labels = [], []
    for ax in (axes[0, 1], count_axes[0]):
        h, l = ax.get_legend_handles_labels(); handles.extend(h); labels.extend(l)
    axes[0, 1].legend(handles, labels, fontsize=7, ncol=2, loc='upper left')
    axes[-1, 0].set_xlabel('Simulation seconds')
    axes[-1, 1].set_xlabel('Simulation seconds')
    fig.suptitle('Paired W1 history · source-recorded counts; union area uses 96×96 world')
    save(fig, out, 'paired-union-dominant-timeline')


def episode_rows(result):
    rows = []
    for status, key in (('frozen', 'episodes'), ('discarded', 'discardedEpisodes'),
                        ('right-censored', 'rightCensoredEpisodes')):
        for episode in result.get(key, []):
            birth = episode.get('birthTimeSeconds')
            end = episode.get('closeTimeSeconds')
            if end is None:
                end = birth + episode.get('observedDurationSeconds', 0)
            rows.append((episode, status, float(birth), float(end)))
    return rows


def plot_episode_timing(data, out):
    fig, axes = plt.subplots(len(SEEDS), 2, figsize=(14, 9), squeeze=False,
                             constrained_layout=True, sharex=True, sharey=True)
    life_manifest = []
    for si, seed in enumerate(data['seeds']):
        for ci, condition in enumerate(('baseline', 'candidate')):
            ax = axes[si, ci]
            rows = episode_rows(seed[condition])
            for ri, (episode, status, birth, end) in enumerate(rows):
                y = ri
                color = {'frozen': '#287a55', 'discarded': '#888888', 'right-censored': '#d17a32'}[status]
                ax.hlines(y, birth, end, color=color, linewidth=1.0)
                ax.plot(birth, y, '|', color=color, markersize=3)
                life_manifest.append({'seed': seed['seed'], 'condition': condition, 'id': episode['id'],
                                      'status': status, 'birthTimeSeconds': birth,
                                      'endTimeSeconds': end, 'durationSeconds': end - birth,
                                      'occupiedCells': episode.get('occupiedCells', len(episode['cellIndices']))})
            ax.set(title=f'{seed["seed"]} · {condition} · n={len(rows)}', xlim=(0, 600), ylabel='Episode (all recorded)')
            ax.grid(axis='x', alpha=.2)
    axes[-1, 0].set_xlabel('Birth to closure or observed horizon · seconds')
    axes[-1, 1].set_xlabel('Birth to closure or observed horizon · seconds')
    fig.suptitle('All closed/discarded/pending terminal episodes · no display selection')
    save(fig, out, 'episode-lifetimes')
    return life_manifest


def plot_size_character(data, out):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), constrained_layout=True)
    for seed in data['seeds']:
        for condition in ('baseline', 'candidate'):
            eps = seed[condition]['episodes']
            sizes = sorted(int(e.get('occupiedCells', len(e['cellIndices']))) for e in eps)
            if sizes:
                y = np.arange(1, len(sizes) + 1) / len(sizes)
                axes[0].step(sizes, y, where='post', color=COLORS[condition], alpha=.65,
                             label=f'{seed["seed"]} {condition} n={len(sizes)}')
            pairs = [(e.get('character', {}).get('consolidation'), e.get('character', {}).get('directionalOrder'))
                     for e in eps]
            pairs = [(float(x), float(y)) for x, y in pairs if x is not None and y is not None
                     and np.isfinite(x) and np.isfinite(y) and 0 <= x <= 1 and 0 <= y <= 1]
            if pairs:
                axes[1].scatter([p[0] for p in pairs], [p[1] for p in pairs], s=18, alpha=.55,
                                color=COLORS[condition], marker='o' if condition == 'baseline' else '^',
                                label=f'{seed["seed"]} {condition} n={len(pairs)}')
    axes[0].set(xlabel='Frozen episode occupied cells', ylabel='Cumulative fraction', ylim=(0, 1))
    axes[1].set(xlim=LIMITS, ylim=LIMITS, xlabel='Consolidation', ylabel='Directional order')
    for ax in axes: ax.grid(alpha=.2); ax.legend(fontsize=6)
    fig.suptitle('Frozen size distributions and paired-coordinate character · source episode values')
    save(fig, out, 'frozen-size-and-character')


def plot_largest(data, out):
    fig, axes = plt.subplots(len(SEEDS), 2, figsize=(8, 11), squeeze=False, constrained_layout=True)
    selections = []
    for si, seed in enumerate(data['seeds']):
        for ci, condition in enumerate(('baseline', 'candidate')):
            eps = seed[condition]['episodes']
            ax = axes[si, ci]
            if not eps:
                ax.text(.5, .5, 'No naturally frozen episode', ha='center', va='center', transform=ax.transAxes)
                ax.set_axis_off()
                continue
            episode = max(eps, key=lambda e: (e.get('occupiedCells', len(e['cellIndices'])), -e['id']))
            mask = np.zeros(CELLS, dtype=np.uint8)
            cells = np.asarray(episode['cellIndices'], dtype=np.int64)
            if np.any(cells < 0) or np.any(cells >= CELLS) or len(np.unique(cells)) != len(cells):
                raise ValueError(f'invalid frozen episode geometry {seed["seed"]}/{condition}/{episode["id"]}')
            mask[cells] = 1
            mask_image(ax, mask, f'{seed["seed"]} · {condition} · episode {episode["id"]}\n{len(cells)} exact recorded cells')
            selections.append({'seed': seed['seed'], 'condition': condition, 'episodeId': episode['id'],
                               'occupiedCells': len(cells), 'selection': 'largest naturally frozen by occupiedCells; lowest id tie-break'})
    fig.suptitle('Largest naturally frozen episode per seed and condition · exact recorded cells · world [0,1]')
    save(fig, out, 'largest-frozen-geometries')
    return selections


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    data = read_input(args.input)
    args.output.mkdir(parents=True, exist_ok=True)
    milestones_selected = plot_morphology(data, args.output)
    plot_history(data, args.output)
    lifetimes = plot_episode_timing(data, args.output)
    plot_size_character(data, args.output)
    largest = plot_largest(data, args.output)
    outputs = sorted(p for p in args.output.iterdir() if p.suffix in ('.png', '.svg'))
    manifest = {'schemaVersion': 1, 'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                'plotterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'seeds': list(SEEDS), 'worldLimits': [0, 1], 'grid': [GRID, GRID],
                'fixedScales': {'worldX': [0, 1], 'worldY': [0, 1], 'worldAspect': 'equal',
                                'frozenAndPendingAreaFraction': [0, 1],
                                'characterCoordinates': {'x': [0, 1], 'y': [0, 1]},
                                'milestoneMaskValues': [0, 1], 'milestoneTargetsSeconds': list(TARGETS)},
                'milestones': milestones_selected, 'episodeLifetimes': lifetimes,
                'lifetimeScope': 'All closed, discarded and right-censored episodes; absorbed owner IDs are excluded from lifetimes and represented in identity events/split fates.',
                'largestFrozenSelections': largest,
                'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs},
                'plotScope': ['recorded milestone frozen/pending masks', 'recorded history counts',
                              'all frozen/discarded/right-censored episode lifetimes',
                              'frozen episode size distributions', 'finite character coordinate pairs',
                              'largest naturally frozen episode geometry']}
    (args.output / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
