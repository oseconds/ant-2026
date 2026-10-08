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
FULL_STATUSES = {'complete', 'complete-with-character-gaps'}


def character_value(episode, key):
    value = episode.get('character', {}).get(key)
    if value is None:
        return None
    value = float(value)
    return value if np.isfinite(value) and 0 <= value <= 1 else None


def gap_summary(seed_id, gap):
    return {'seed': seed_id, 'code': gap['code'], 'timeSeconds': gap['timeSeconds'],
            'episodeId': gap.get('episodeId', gap.get('episode', {}).get('id')),
            'details': gap.get('details', {})}


def read_input(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    seed_ids = [seed.get('seed') for seed in data.get('seeds', [])]
    status = data.get('status')
    valid_seeds = ((status in FULL_STATUSES and seed_ids == SEEDS)
                   or (status == 'stopped-data-gap' and bool(seed_ids)
                       and seed_ids == SEEDS[:len(seed_ids)]))
    if data.get('schemaVersion') != 1 or not valid_seeds:
        raise ValueError('expected W1 schema v1 with a complete canonical seed set or stopped analyzed prefix')
    if [row.get('seed') for row in data.get('baselineMilestones', [])] != SEEDS:
        raise ValueError('expected three canonical baseline field archives')
    if status in FULL_STATUSES and data.get('inputOnlySeeds'):
        raise ValueError('complete W1 artifact cannot contain input-only seeds')
    for seed in data['seeds']:
        if status == 'stopped-data-gap' and (seed.get('status') != 'stopped-data-gap'
                or not seed.get('dataGap') or not seed.get('stopSnapshot')):
            raise ValueError(f'missing explicit data-gap stop record for seed {seed.get("seed")}')
        if status == 'complete' and (seed.get('dataGap') is not None or seed.get('stopSnapshot') is not None):
            raise ValueError(f'complete W1 seed {seed.get("seed")} has a stopped-state snapshot')
        for ep in seed['episodes']:
            values = [character_value(ep, k) for k in ('consolidation', 'directionalOrder')]
            if status in {'complete', 'stopped-data-gap'} and any(value is None for value in values):
                raise ValueError(f'missing character value for seed {seed["seed"]}, episode {ep["id"]}')
            if status == 'complete-with-character-gaps' and values[0] is None:
                raise ValueError(f'missing consolidation value for seed {seed["seed"]}, episode {ep["id"]}')
            if status == 'complete-with-character-gaps' and values[1] is None and not ep.get('characterGap'):
                raise ValueError(f'untyped directional gap for seed {seed["seed"]}, episode {ep["id"]}')
            if any(i < 0 or i >= CELLS for i in ep['cellIndices']):
                raise ValueError(f'episode index outside fixed {GRID}x{GRID} grid')
    if status == 'complete-with-character-gaps' and not any(seed.get('dataGaps') for seed in data['seeds']):
        raise ValueError('character-gap W1 artifact lacks typed gap records')
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
        pending_label = ('Pending W1 UNFROZEN, right-censored at archive horizon'
                         if data['status'] in FULL_STATUSES else 'Pending at observed stop')
        for key, label, style in [('frozenCells', 'Frozen W1 union', '-'),
                                  ('pendingCells', pending_label, '--'),
                                  ('productionCells', 'Production', ':'),
                                  ('localAccretionCells', 'Previous local accretion', '-.')]:
            axes[0].plot(t, [row[key] / CELLS for row in h], color=COLORS[si], linestyle=style,
                         alpha=.9, label=f'{seed["seed"]} {label}')
        axes[1].plot(t, [row['newFrozenCells'] / CELLS for row in h], color=COLORS[si],
                     label=str(seed['seed']))
    axes[0].set(xlabel='Simulation seconds', ylabel='Occupied world area fraction', ylim=(0, 1))
    axes[1].set(xlabel='Simulation seconds', ylabel='New frozen area fraction per observation', ylim=(0, 1))
    end_time = max(seed['history'][-1]['timeSeconds'] for seed in data['seeds'])
    for ax in axes:
        ax.set_xlim(0, end_time)
        if data['status'] == 'stopped-data-gap':
            ax.axvline(end_time, color='#555555', linestyle=':', linewidth=1)
        ax.grid(alpha=.2)
    axes[0].legend(ncol=2, fontsize=7)
    axes[1].legend(title='Analyzed seed', fontsize=8)
    if data['status'] in FULL_STATUSES:
        label = ('complete natural-seed archive' if data['status'] == 'complete'
                 else 'complete geometry, incomplete character coverage')
        fig.suptitle(f'W1 {label} · pending material remains unfrozen and right-censored')
    else:
        analyzed = ', '.join(str(seed['seed']) for seed in data['seeds'])
        input_only = ', '.join(str(seed.get('seed')) for seed in data.get('inputOnlySeeds', [])) or 'none'
        fig.suptitle(f'W1 analyzed prefix only · DATA GAP at {end_time:.3f}s · analyzed {analyzed}\n'
                     f'Input-only seeds (no W1 mechanism analysis): {input_only}')
    save(fig, out, 'area-and-formation-timeline')


def plot_checkpoints(data, out):
    if data['status'] in FULL_STATUSES:
        reps = [('frozen', 'Frozen W1'), ('pending', 'Pending W1\nUNFROZEN'),
                ('production', 'Production'), ('localAccretion', 'Prior local accretion')]
        fig, axes = plt.subplots(3, 12, figsize=(17, 7), constrained_layout=True)
        rows_by_seed = data['seeds']
        targets = (120, 300, 599)
        key_for = lambda milestone, key: milestone['masks'][key]
        stem = 'matched-world-masks'
        title = 'Matched actual W1 and baseline masks · fixed world scale [0,1] × [0,1]'
    else:
        reps = [('productionMask', 'Prior production'), ('shadowMask', 'Prior local-accretion shadow'),
                ('trafficMask', 'Archived traffic')]
        fig, axes = plt.subplots(3, 9, figsize=(15, 7), constrained_layout=True)
        rows_by_seed = data['baselineMilestones']
        targets = (120, 300, 600)
        key_for = lambda milestone, key: milestone[key]
        stem = 'historical-baseline-masks'
        title = 'Historical baseline masks only · W1 unavailable · fixed world scale [0,1] × [0,1]'
    for si, seed in enumerate(rows_by_seed):
        for ci, target in enumerate(targets):
            row = min(seed['milestones'], key=lambda m: abs(m['requestedSeconds'] - target))
            if abs(row['requestedSeconds'] - target) > 1e-9:
                row = min(seed['milestones'], key=lambda m: abs(m['sampledSeconds'] - target))
            if abs(row['sampledSeconds'] - target) > 1.0:
                raise ValueError(f'missing matched {target}s milestone for seed {seed["seed"]}')
            for ri, (key, label) in enumerate(reps):
                ax = axes[si, ci * len(reps) + ri]
                values = np.asarray(key_for(row, key))
                if values.size != CELLS or not np.isin(values, (0, 1)).all():
                    raise ValueError(f'invalid {key} mask at {seed["seed"]}/{target}s')
                mask = values.astype(np.uint8, copy=False)
                ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                          interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
                world_axes(ax)
                ax.set_title(f'{seed["seed"]} · {row["sampledSeconds"]:g}s\n{label}', fontsize=6)
                ax.tick_params(labelsize=5)
    fig.suptitle(title)
    save(fig, out, stem)


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
    if data['status'] in FULL_STATUSES:
        fig.suptitle('Matched archived chemical-memory and mechanical-support fields; fixed [0,1]')
        save(fig, out, 'matched-material-fields')
    else:
        fig.suptitle('Historical baseline chemical-memory and mechanical-support fields; W1 unavailable; fixed [0,1]')
        save(fig, out, 'historical-baseline-fields')


def plot_character(data, out):
    fig, ax = plt.subplots(figsize=(6, 5), constrained_layout=True)
    paired_counts = []
    for si, seed in enumerate(data['seeds']):
        pairs = [(character_value(row, 'consolidation'), character_value(row, 'directionalOrder'))
                 for row in seed['episodes']]
        pairs = [(x, y) for x, y in pairs if x is not None and y is not None]
        total = len(seed['episodes']); paired_counts.append((len(pairs), total))
        if pairs:
            ax.scatter([x for x, _ in pairs], [y for _, y in pairs], s=20, alpha=.72,
                       color=COLORS[si], label=f'{seed["seed"]} · paired {len(pairs)}/{total}')
    ax.set(xlim=LIMITS, ylim=LIMITS, xlabel='Consolidation', ylabel='Directional order')
    ax.grid(alpha=.2)
    if any(count for count, _ in paired_counts):
        ax.legend(title='Seed · paired N/total')
    else:
        ax.text(.5, .5, 'No episodes with both character coordinates', ha='center', va='center', transform=ax.transAxes)
    if data['status'] == 'complete':
        fig.suptitle('W1 frozen-episode character coordinates\nComplete three-seed replay · cumulative contact history')
    elif data['status'] == 'complete-with-character-gaps':
        fig.suptitle('W1 frozen-episode character coordinates\nComplete geometry · paired character coverage incomplete')
    else:
        fig.suptitle('W1 prefix character · N=0 at data-gap stop' if not any(seed['episodes'] for seed in data['seeds'])
                     else 'W1 prefix character · pass stopped at data gap')
    save(fig, out, 'character-coordinates')

    fig, axes = plt.subplots(len(data['seeds']), 2, figsize=(9, 3.2 * len(data['seeds'])), squeeze=False,
                             constrained_layout=True)
    for si, seed in enumerate(data['seeds']):
        for ai, (key, label) in enumerate((('consolidation', 'Consolidation'),
                                           ('directionalOrder', 'Directional order'))):
            ax = axes[si, ai]
            values = np.sort([value for r in seed['episodes']
                              if (value := character_value(r, key)) is not None])
            total = len(seed['episodes'])
            if len(values):
                ax.hist(values, bins=np.linspace(0, 1, 11), color=COLORS[si], alpha=.55,
                        edgecolor='white', density=True, label=f'10-bin density · n={len(values)}/{total}')
                ax.set_ylim(bottom=0, top=max(1, ax.get_ylim()[1]))
                # ECDF uses its own right axis; both coordinate axes remain fixed to [0,1].
                twin = ax.twinx()
                twin.step(values, np.arange(1, len(values) + 1) / len(values), where='post',
                          color='#222222', linewidth=1, label='ECDF')
                twin.set_ylim(0, 1); twin.set_ylabel('ECDF')
            else:
                ax.text(.5, .5, f'No valid {label.lower()} values\n0/{total} episodes', ha='center', va='center',
                        transform=ax.transAxes)
            ax.set(xlim=LIMITS, xlabel=label, ylabel='Density')
            ax.set_title(f'{seed["seed"]} · valid n={len(values)}/{total}')
            ax.grid(alpha=.15)
    if data['status'] == 'complete':
        title = 'W1 frozen-episode distributions · fixed coordinate range [0,1]'
    elif data['status'] == 'complete-with-character-gaps':
        title = 'Per-axis available W1 character values · complete geometry · fixed range [0,1]'
    else:
        title = 'Analyzed-prefix distributions only; pass stopped at data gap; fixed coordinate range [0,1]'
    fig.suptitle(title)
    save(fig, out, 'character-distributions')


def plot_episodes(data, out):
    selected = []
    for si, seed in enumerate(data['seeds']):
        episodes = seed['episodes']
        if not episodes:
            reason = ('no frozen episodes' if data['status'] in FULL_STATUSES
                      else 'no valid frozen episodes before stop')
            selected.append({'seed': seed['seed'], 'selection': 'none', 'reason': reason})
            fig, ax = plt.subplots(figsize=(4, 3.5), constrained_layout=True)
            ax.text(.5, .5, reason, ha='center', va='center', transform=ax.transAxes)
            ax.set_axis_off()
            fig.suptitle(f'W1 complete archive geometry · seed {seed["seed"]}' if data['status'] in FULL_STATUSES
                         else f'Analyzed prefix only · seed {seed["seed"]}')
            save(fig, out, f'episodes-seed{seed["seed"]}')
            continue
        choices = [('smallest area', min(episodes, key=lambda e: (e['occupiedCells'], e['id']))),
                   ('largest area', max(episodes, key=lambda e: (e['occupiedCells'], -e['id'])))]
        for key, label, select_max in [('consolidation', 'lowest consolidation', False),
                                       ('directionalOrder', 'highest directional order', True)]:
            available = [episode for episode in episodes if character_value(episode, key) is not None]
            if available:
                chosen = (max(available, key=lambda e: (character_value(e, key), -e['id'])) if select_max
                          else min(available, key=lambda e: (character_value(e, key), e['id'])))
                choices.append((label, chosen))
        if data['status'] == 'complete-with-character-gaps':
            unresolved = [episode for episode in episodes
                          if character_value(episode, 'directionalOrder') is None]
            if unresolved:
                episode = min(unresolved, key=lambda e: e['id'])
                choices.append((f'first direction gap · episode {episode["id"]}', episode))
        unique = []
        for label, episode in choices:
            if all(ep['id'] != episode['id'] for _, ep in unique):
                unique.append((label, episode))
        selected.extend({'seed': seed['seed'], 'id': ep['id'], 'selection': label,
                         'areaCells': ep['occupiedCells'], 'areaFraction': ep['areaFraction'],
                         'characterStatus': ep.get('characterStatus', 'complete'),
                         'consolidation': character_value(ep, 'consolidation'),
                         'directionalOrder': character_value(ep, 'directionalOrder')}
                        for label, ep in unique)
        columns = min(4, len(unique)); rows = int(np.ceil(len(unique) / columns))
        fig, axes = plt.subplots(rows, columns, figsize=(3.4 * columns, 3.8 * rows), squeeze=False,
                                 constrained_layout=True)
        for ax, (label, ep) in zip(axes.flat, unique):
            mask = np.zeros(CELLS, dtype=np.uint8); mask[np.asarray(ep['cellIndices'], dtype=int)] = 1
            ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                      interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
            world_axes(ax)
            direction = character_value(ep, 'directionalOrder')
            order_label = 'unavailable' if direction is None else f'{direction:.2f}'
            ax.set_title(f'{label}\nepisode {ep["id"]} · {ep["occupiedCells"]} cells · D={order_label}', fontsize=7)
        for ax in list(axes.flat)[len(unique):]:
            ax.set_axis_off()
        fig.suptitle((f'Actual frozen W1 episode geometry · seed {seed["seed"]}' if data['status'] in FULL_STATUSES
                      else f'Actual valid frozen geometry from analyzed prefix · seed {seed["seed"]}'))
        save(fig, out, f'episodes-seed{seed["seed"]}')
    return selected


def plot_pending_archive(data, out):
    for seed in data['seeds']:
        episodes = seed['rightCensoredEpisodes']
        columns = min(4, max(1, len(episodes)))
        rows = max(1, int(np.ceil(len(episodes) / columns)))
        fig, axes = plt.subplots(rows, columns, figsize=(3.4 * columns, 3.8 * rows), squeeze=False,
                                 constrained_layout=True)
        if not episodes:
            axes[0, 0].text(.5, .5, 'No pending episodes at archive horizon', ha='center', va='center',
                            transform=axes[0, 0].transAxes)
            axes[0, 0].set_axis_off()
            fig.suptitle(f'Archive horizon · seed {seed["seed"]}\nNo unfrozen right-censored episodes recorded')
            save(fig, out, f'pending-right-censored-seed{seed["seed"]}')
            continue
        for ax, episode in zip(axes.flat, episodes):
            indices = np.asarray(episode['cellIndices'], dtype=int)
            if np.any(indices < 0) or np.any(indices >= CELLS):
                raise ValueError(f'right-censored episode outside fixed grid: {seed["seed"]}/{episode["id"]}')
            mask = np.zeros(CELLS, dtype=np.uint8); mask[indices] = 1
            ax.imshow(mask.reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                      interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
            world_axes(ax)
            ax.set_title(f'episode {episode["id"]} · {len(indices)} cells\nUNFROZEN, right-censored', fontsize=8)
        for ax in list(axes.flat)[len(episodes):]:
            ax.set_axis_off()
        fig.suptitle(f'Actual pending geometry at archive horizon · seed {seed["seed"]}\n'
                     'Unfrozen right-censored episodes are not successful frozen material')
        save(fig, out, f'pending-right-censored-seed{seed["seed"]}')


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
    if data['status'] in FULL_STATUSES:
        plot_pending_archive(data, args.output)
        stop_snapshots = []
    else:
        stop_snapshots = [plot_stop_snapshot(seed, seed['dataGap'], args.output) for seed in data['seeds']]
    outputs = sorted(p for p in args.output.iterdir() if p.suffix in ('.png', '.svg'))
    manifest = {'schemaVersion': 1, 'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                'plotterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'status': data['status'], 'analyzedSeeds': [seed['seed'] for seed in data['seeds']],
                'inputOnlySeeds': [{'seed': seed['seed'], 'status': seed['status']}
                                   for seed in data.get('inputOnlySeeds', [])],
                'dataGaps': ([gap_summary(seed['seed'], seed['dataGap']) for seed in data['seeds']]
                             if data['status'] == 'stopped-data-gap' else
                             [gap_summary(seed['seed'], gap) for seed in data['seeds']
                              for gap in seed.get('dataGaps', [])]
                             if data['status'] == 'complete-with-character-gaps' else []),
                'stopSnapshots': stop_snapshots,
                'rightCensoredEpisodeIds': ({str(seed['seed']): [episode['id'] for episode in seed['rightCensoredEpisodes']]
                                             for seed in data['seeds']} if data['status'] in FULL_STATUSES else {}),
                'worldLimits': [0, 1], 'grid': [GRID, GRID],
                'checkpointTargetsSeconds': ([120, 300, 599] if data['status'] in FULL_STATUSES else [120, 300, 600]),
                'selectedActualEpisodes': selected,
                'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs},
                'interpretation': ('Complete W1 analysis across all three canonical seeds. Frozen and pending geometries are exact recorded cell masks; pending is unfrozen and right-censored.'
                                   if data['status'] == 'complete' else
                                   'Complete W1 formation geometry across all three canonical seeds; character gaps remain unresolved. Scatter uses paired finite coordinates only, while each axis distribution uses its available population.'
                                   if data['status'] == 'complete-with-character-gaps' else
                                   'W1 analysis stopped at the first character data gap. Character and material plots show only the analyzed prefix; historical masks and fields are separate prior baselines, not W1. Unresolved geometry is the recorded stop snapshot, not a frozen episode.')}
    (args.output / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
