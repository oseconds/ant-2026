#!/usr/bin/env python3
"""Fixed-scale descriptive plots for natural movement and material morphology artifacts."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import numpy as np

SEEDS = [20261005, 20261006, 20261007]
GRID = 96
WORLD = (0.0, 1.0)
CHECKPOINTS = [30, 60, 120, 300, 600]
FIELD_LIMITS = {'chemical': (0.0, 0.8), 'chemicalMemory': (0.0, 1.0),
                'surface': (0.0, 1.0), 'support': (0.0, 1.0)}
COLORS = ['#267b9b', '#d17a32', '#8064a2']


def read_json(path):
    raw = path.read_bytes()
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    return json.loads(raw)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def world_axes(ax):
    ax.set_xlim(*WORLD)
    ax.set_ylim(*WORLD)
    ax.set_aspect('equal', adjustable='box')
    ax.set_xlabel('World x')
    ax.set_ylabel('World y')


def validate_grid(values, label):
    array = np.asarray(values, dtype=float)
    if array.shape != (GRID, GRID) or not np.isfinite(array).all():
        raise ValueError(f'{label}: expected finite {GRID}x{GRID} grid')
    return array


def plot_movement(movement, out):
    rows = movement['seeds']
    if [row['seed'] for row in rows] != SEEDS:
        raise ValueError('Movement artifact must contain the three natural seeds in canonical order')
    windows = [1, 5, 20]
    fig, axes = plt.subplots(3, 3, figsize=(11, 11), constrained_layout=True)
    selected = []
    for si, seed in enumerate(rows):
        for wi, seconds in enumerate(windows):
            window = next(row for row in seed['windows'] if row['windowSeconds'] == seconds)
            reps = window['representativeWindows']
            if isinstance(reps, list):
                rep_rows = reps
            else:
                rep_rows = [reps.get('medianTortuosity')]
                rep_rows.extend(reps.get('byCategory', {}).values())
            rep = next((item for item in rep_rows if item), None)
            if rep is None:
                raise ValueError(f'missing actual movement trace: seed {seed["seed"]}, {seconds}s')
            coordinates = np.asarray(rep['coordinates'], dtype=float)
            if coordinates.ndim != 2 or coordinates.shape[1] != 2 or not np.isfinite(coordinates).all():
                raise ValueError('movement coordinates must be a finite Nx2 array')
            ax = axes[si, wi]
            ax.plot(coordinates[:, 0], coordinates[:, 1], color=COLORS[si], linewidth=1)
            world_axes(ax)
            end = rep['startSeconds'] + seconds
            ax.set_title(f'{seed["seed"]} · ant {rep["antId"]}\n{rep["startSeconds"]:g}–{end:g}s')
            selected.append({'seed': seed['seed'], 'seconds': seconds, 'antId': rep['antId'],
                             'startSeconds': rep['startSeconds'], 'endSeconds': end,
                             'selection': rep.get('selection', rep.get('category', 'actual recorded representative')),
                             'metrics': rep.get('metrics')})
    fig.suptitle('Observed ANT movement traces; fixed world axes [0,1] × [0,1]')
    fig.savefig(out / 'movement-traces.png', dpi=170)
    plt.close(fig)

    maximum = []
    fig, axes = plt.subplots(3, 3, figsize=(11, 11), constrained_layout=True)
    for si, seed in enumerate(rows):
        for wi, seconds in enumerate(windows):
            window = next(row for row in seed['windows'] if row['windowSeconds'] == seconds)
            rep = window['representativeWindows']['maximumTortuosity']
            coordinates = np.asarray(rep['coordinates'], dtype=float)
            if coordinates.ndim != 2 or coordinates.shape[1] != 2 or not np.isfinite(coordinates).all():
                raise ValueError('maximum-tortuosity coordinates must be finite Nx2')
            ax = axes[si, wi]
            ax.plot(coordinates[:, 0], coordinates[:, 1], color=COLORS[si], linewidth=1)
            world_axes(ax)
            end = rep['startSeconds'] + seconds
            tortuosity = rep['metrics']['tortuosity']
            ax.set_title(f'{seed["seed"]} · ant {rep["antId"]} · τ={tortuosity:.3g}\n{rep["startSeconds"]:g}–{end:g}s')
            maximum.append({'seed': seed['seed'], 'seconds': seconds, 'antId': rep['antId'],
                            'startSeconds': rep['startSeconds'], 'endSeconds': end,
                            'tortuosity': tortuosity, 'selection': 'maximum finite tortuosity among complete windows'})
    fig.suptitle('Observed maximum-tortuosity movement windows; fixed world axes [0,1] × [0,1]')
    fig.savefig(out / 'movement-maximum-tortuosity.png', dpi=170)
    plt.close(fig)

    confined = []
    fig, axes = plt.subplots(1, 3, figsize=(11, 4), constrained_layout=True)
    for si, seed in enumerate(rows):
        window = next(row for row in seed['windows'] if row['windowSeconds'] == 5)
        rep = window['representativeWindows']['byCategory'].get('confined-local-return')
        if rep is None:
            raise ValueError(f'missing observed confined-local-return window for seed {seed["seed"]}')
        coordinates = np.asarray(rep['coordinates'], dtype=float)
        if coordinates.ndim != 2 or coordinates.shape[1] != 2 or not np.isfinite(coordinates).all():
            raise ValueError('confined-local-return coordinates must be finite Nx2')
        ax = axes[si]
        ax.plot(coordinates[:, 0], coordinates[:, 1], color=COLORS[si], linewidth=1)
        world_axes(ax)
        end = rep['startSeconds'] + 5
        ax.set_title(f'{seed["seed"]} · ant {rep["antId"]}\n{rep["startSeconds"]:g}–{end:g}s')
        confined.append({'seed': seed['seed'], 'seconds': 5, 'antId': rep['antId'],
                         'startSeconds': rep['startSeconds'], 'endSeconds': end,
                         'category': 'confined-local-return', 'metrics': rep['metrics'],
                         'selection': 'observed representative in analyst-defined category'})
    fig.suptitle('Observed confined-local-return examples (descriptive category); fixed world axes')
    fig.savefig(out / 'movement-confined-local-return.png', dpi=170)
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(12, 4), constrained_layout=True)
    metric = 'tortuosity'
    all_p90 = [next(item for item in seed['windows'] if item['windowSeconds'] == seconds)['aggregates'][metric]['p90']
               for seed in rows for seconds in windows]
    shared_ymax = max(1.0, float(np.nanmax(all_p90)) * 1.05)
    for ax, seconds in zip(axes, windows):
        values = []
        for seed in rows:
            row = next(item for item in seed['windows'] if item['windowSeconds'] == seconds)
            summary = row['aggregates'][metric]
            values.append([summary[k] for k in ('p50', 'p90')])
        values = np.asarray(values, dtype=float)
        if not np.isfinite(values).all():
            raise ValueError('non-finite movement aggregate')
        for si in range(len(SEEDS)):
            ax.plot([0, 1], values[si], marker='o', color=COLORS[si], label=f'Seed {SEEDS[si]}')
        ax.set_xticks([0, 1], ['p50', 'p90'])
        ax.set_ylabel('Tortuosity (path length / displacement)')
        ax.set_ylim(0, shared_ymax)
        ax.set_title(f'{seconds}s complete-window distribution')
        ax.grid(alpha=.2)
    axes[0].legend(fontsize=7)
    fig.suptitle('Movement aggregate comparison; shared y scale within each panel')
    fig.savefig(out / 'movement-aggregate-comparison.png', dpi=170)
    plt.close(fig)
    return {'representatives': selected, 'maximumTortuosity': maximum, 'confinedLocalReturn': confined,
            'aggregateTortuosityY': [0.0, shared_ymax]}


def plot_plates(plates, out):
    seeds = plates['seeds']
    if [row['seed'] for row in seeds] != SEEDS:
        raise ValueError('Plate artifact must contain the three natural seeds in canonical order')
    pool = [(seed['seed'], plate) for seed in seeds for plate in seed['plates']]
    columns = 6
    rows = max(1, int(np.ceil(len(pool) / columns)))
    fig, axes = plt.subplots(rows, columns, figsize=(columns * 2.1, rows * 2.1), squeeze=False,
                             constrained_layout=True)
    ids = []
    flat_axes = list(axes.flat)
    for ax, (seed_id, plate) in zip(flat_axes, pool):
        geom = plate['geometry']
        indices = np.asarray(geom['maskIndices'], dtype=int)
        if indices.size == 0 or np.any(indices < 0) or np.any(indices >= GRID * GRID):
            raise ValueError(f'invalid frozen Plate mask: {plate["id"]}')
        mask = np.zeros((GRID, GRID), dtype=np.uint8)
        mask.flat[indices] = 1
        ax.imshow(mask, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                  vmin=0, vmax=1, cmap='Blues', alpha=.8)
        nodes = {node['index']: node for node in geom['centerline']}
        for a, b in geom['edges']:
            if a not in nodes or b not in nodes:
                raise ValueError(f'edge references missing centerline node: {plate["id"]}')
            ax.plot([nodes[a]['x'], nodes[b]['x']], [nodes[a]['y'], nodes[b]['y']], color='#b23b35', linewidth=.7)
        world_axes(ax)
        ax.set_title(f'{seed_id} · {plate["id"]}\n{plate["bornAtSimulationTimeMs"] / 1000:g}s', fontsize=7)
        ids.append({'seed': seed_id, 'id': plate['id'], 'bornAtSimulationTimeMs': plate['bornAtSimulationTimeMs']})
    for ax in list(flat_axes)[len(pool):]:
        ax.axis('off')
    fig.suptitle('All naturally born frozen Plates; identical world extent and cell scale')
    fig.savefig(out / 'all-born-plates.png', dpi=170)
    plt.close(fig)

    if pool:
        # Select continuous-measure extrema; labels describe the measured selector only.
        selectors = [('smallest footprint', 'footprint', 'normalizedArea', min),
                     ('largest footprint', 'footprint', 'normalizedArea', max),
                     ('maximum principal tortuosity', None, 'principalTortuosity', max),
                     ('most junction-pixel clusters (raster proxy)', 'network', 'junctionClusterCount', max)]
        chosen = []
        for label, group, key, choose in selectors:
            available = [(seed, plate, plate['measures'][group][key] if group else plate['measures'][key])
                         for seed, plate in pool]
            available = [row for row in available if row[2] is not None and np.isfinite(row[2])]
            if available:
                seed, plate, value = choose(available, key=lambda row: row[2])
                if all(plate['id'] != prior[1]['id'] or seed != prior[0] for prior in chosen):
                    chosen.append((seed, plate, label, value))
        fig, axes = plt.subplots(1, max(1, len(chosen)), figsize=(4 * max(1, len(chosen)), 4), squeeze=False,
                                 constrained_layout=True)
        for ax, (seed, plate, label, value) in zip(axes[0], chosen):
            geom = plate['geometry']; nodes = {node['index']: node for node in geom['centerline']}
            mask = np.zeros((GRID, GRID), dtype=np.uint8); mask.flat[np.asarray(geom['maskIndices'], dtype=int)] = 1
            ax.imshow(mask, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest', vmin=0, vmax=1, cmap='Blues', alpha=.8)
            for a, b in geom['edges']:
                ax.plot([nodes[a]['x'], nodes[b]['x']], [nodes[a]['y'], nodes[b]['y']], color='#b23b35', linewidth=.9)
            world_axes(ax); ax.set_title(f'{label}\nseed {seed}, {plate["id"]}, value={value:.3g}', fontsize=8)
        fig.suptitle('Observed examples selected by continuous measures; labels are selectors, not classes')
        fig.savefig(out / 'plate-measure-extremes.png', dpi=170)
        plt.close(fig)
        selectors_meta = [{'seed': s, 'id': p['id'], 'selector': label, 'value': value} for s, p, label, value in chosen]
    else:
        selectors_meta = []
    return ids, selectors_meta


def plot_retention(retention, out):
    seeds = retention['seeds']
    if [row['seed'] for row in seeds] != SEEDS:
        raise ValueError('Retention artifact must contain the three natural seeds in canonical order')
    fig, axes = plt.subplots(2, 2, figsize=(10, 8), constrained_layout=True)
    measures = [('occupiedCells', 'Occupied contact cells'),
                ('repeatCellsAtLeastTwoSeconds', 'Cells with contacts in ≥2 seconds'),
                ('repeatComponentsEightNeighbor', 'Eight-neighbor repeated-contact components'),
                ('medianDistinctContactSecondsPerCell', 'Median distinct contact seconds per cell')]
    for ax, (key, title) in zip(axes.flat, measures):
        for si, seed_id in enumerate(SEEDS):
            seed = next(item for item in seeds if item['seed'] == seed_id)
            rows = seed['contactSpace']['scales']['0.03']['checkpoints']
            sampled = [next(item for item in rows if item['requestedSeconds'] == seconds) for seconds in CHECKPOINTS]
            values = [item['cumulative'][key] for item in sampled]
            times = [item['sampledSeconds'] for item in sampled]
            ax.plot(times, values, marker='o', color=COLORS[si], label=f'Seed {seed_id}')
        ax.set_title(title); ax.set_xlabel('Simulation seconds'); ax.grid(alpha=.2)
    axes[0, 0].legend(fontsize=8)
    fig.suptitle('Archived actual contact traffic at matched checkpoints; shared scale across seeds')
    fig.savefig(out / 'contact-traffic-components.png', dpi=170); plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4), constrained_layout=True)
    for ax, metric, title in [(axes[0], 'jointChemicalSupportCells', 'Joint chemical-qualified support cells'),
                              (axes[1], 'contactJointSupportJaccard', 'Contact vs support Jaccard')]:
        for si, seed_id in enumerate(SEEDS):
            seed = next(item for item in seeds if item['seed'] == seed_id)
            rows = seed['environmentCheckpoints']
            sampled = [next(item for item in rows if item['requestedSeconds'] == seconds) for seconds in CHECKPOINTS]
            values = [item['scales']['0.03']['cumulative'][metric] for item in sampled]
            times = [item['sampledSeconds'] for item in sampled]
            ax.plot(times, values, marker='o', color=COLORS[si], label=f'Seed {seed_id}')
        ax.set_title(title); ax.set_xlabel('Simulation seconds'); ax.grid(alpha=.2)
    axes[0].legend(fontsize=8)
    fig.suptitle('Matched environment checkpoints; association measures are descriptive')
    fig.savefig(out / 'contact-support-checkpoints.png', dpi=170); plt.close(fig)
    return {'contactScale': 0.03, 'checkpoints': CHECKPOINTS,
            'sampleTimes': [{'seed': seed['seed'], 'requestedSeconds': item['requestedSeconds'],
                             'sampledSeconds': item['sampledSeconds'], 'offsetSeconds': item['offsetSeconds']}
                            for seed in seeds for item in seed['contactSpace']['scales']['0.03']['checkpoints']],
            'metrics': [key for key, _ in measures]}


def decode_snapshots(input_dir):
    snapshots = {}
    for seed in SEEDS:
        summary_path = input_dir / f'seed{seed}-summary.json.gz'
        binary_path = input_dir / f'seed{seed}-snapshots.bin.gz'
        if not summary_path.exists() or not binary_path.exists():
            raise FileNotFoundError(f'missing replay summary or snapshots for seed {seed}')
        summary = read_json(summary_path)
        payload = gzip.decompress(binary_path.read_bytes())
        descriptors = summary['snapshotEncoding']['descriptors']
        target_descriptors = {}
        for requested in CHECKPOINTS:
            nearest = min(descriptors, key=lambda item: abs(item.get('timeSeconds', item['tick'] / 60) - requested))
            actual = float(nearest.get('timeSeconds', nearest['tick'] / 60))
            if abs(actual - requested) > 1.0:
                raise ValueError(f'no snapshot within 1s of requested {requested}s for seed {seed}')
            target_descriptors[nearest['tick']] = requested
        previous = {}
        for descriptor in descriptors:
            current = {}
            for key in summary['snapshotEncoding']['arrayOrder']:
                spec = descriptor['arrays'][key]
                delta = payload[spec['offset']:spec['offset'] + spec['bytes']]
                prior = previous.get(key, bytes(len(delta)))
                if len(prior) != len(delta):
                    raise ValueError(f'bad XOR snapshot size for {seed}:{key}')
                raw = bytes(a ^ b for a, b in zip(delta, prior))
                current[key] = raw
            previous = current
            if descriptor['tick'] in target_descriptors:
                requested = target_descriptors[descriptor['tick']]
                actual = float(descriptor.get('timeSeconds', descriptor['tick'] / 60))
                fields = {}
                for key in ['chemical', 'chemicalMemory', 'surface', 'support']:
                    fields[key] = np.frombuffer(current[key], dtype='<f4').copy().reshape(GRID, GRID)
                fields['contactCounts'] = np.frombuffer(current['contactCounts'], dtype='<u4').copy().reshape(GRID, GRID)
                snapshots[(seed, requested)] = {'fields': fields, 'tick': descriptor['tick'],
                    'actualSeconds': actual, 'offsetSeconds': actual - requested}
    expected = {(seed, seconds) for seed in SEEDS for seconds in CHECKPOINTS}
    if set(snapshots) != expected:
        raise ValueError(f'expected checkpoint snapshots; missing {sorted(expected - set(snapshots))[:4]}')
    return snapshots


def plot_field_snapshots(snapshots, out):
    keys = [('chemical', 'Chemical field'), ('chemicalMemory', 'Chemical memory'),
            ('surface', 'Surface field'), ('support', 'Support')]
    for key, label in keys:
        if key not in FIELD_LIMITS:
            continue
        fig, axes = plt.subplots(len(SEEDS), len(CHECKPOINTS), figsize=(12, 7), constrained_layout=True)
        image = None
        for si, seed_id in enumerate(SEEDS):
            for ci, seconds in enumerate(CHECKPOINTS):
                sampled = snapshots[(seed_id, seconds)]
                array = validate_grid(sampled['fields'][key], f'{seed_id}@{sampled["actualSeconds"]}s:{key}')
                ax = axes[si, ci]
                image = ax.imshow(array, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                                  vmin=FIELD_LIMITS[key][0], vmax=FIELD_LIMITS[key][1], cmap='viridis')
                world_axes(ax); ax.set_title(f'{seed_id} · req {seconds}s\nobs {sampled["actualSeconds"]:.3f}s ({sampled["offsetSeconds"]:+.3f})', fontsize=7)
        fig.colorbar(image, ax=axes, shrink=.7, label=f'{label}; fixed [{FIELD_LIMITS[key][0]}, {FIELD_LIMITS[key][1]}]')
        fig.suptitle(f'{label}: matched checkpoints, fixed color limits and world axes')
        fig.savefig(out / f'field-{key}.png', dpi=160)
        plt.close(fig)

    counts_max = max(float(snapshots[(seed, second)]['fields']['contactCounts'].max()) for seed in SEEDS for second in CHECKPOINTS)
    fig, axes = plt.subplots(len(SEEDS), len(CHECKPOINTS), figsize=(12, 7), constrained_layout=True)
    image = None
    for si, seed_id in enumerate(SEEDS):
        for ci, seconds in enumerate(CHECKPOINTS):
            sampled = snapshots[(seed_id, seconds)]
            array = sampled['fields']['contactCounts']
            image = axes[si, ci].imshow(array, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                                       vmin=0, vmax=max(1, counts_max), cmap='magma')
            world_axes(axes[si, ci]); axes[si, ci].set_title(f'{seed_id} · req {seconds}s\nobs {sampled["actualSeconds"]:.3f}s ({sampled["offsetSeconds"]:+.3f})', fontsize=7)
    fig.colorbar(image, ax=axes, shrink=.7, label=f'Cumulative foot contacts, shared [0, {counts_max:g}]')
    fig.suptitle('Cumulative contact traffic; matched checkpoints and fixed scale')
    fig.savefig(out / 'field-contact-counts.png', dpi=160); plt.close(fig)
    return {'contactCountLimits': [0, max(1, counts_max)], 'fieldLimits': FIELD_LIMITS,
            'snapshotTimes': [{'seed': seed, 'requestedSeconds': second,
                               'sampledSeconds': snapshots[(seed, second)]['actualSeconds'],
                               'offsetSeconds': snapshots[(seed, second)]['offsetSeconds'],
                               'tick': snapshots[(seed, second)]['tick']}
                              for seed in SEEDS for second in CHECKPOINTS]}


def plot_candidates(input_dir, out):
    selected = []
    for seed in SEEDS:
        path = input_dir / f'seed{seed}-summary.json.gz'
        if not path.exists():
            continue
        summary = read_json(path)
        rows = summary['morphology']
        components = [(row, component) for row in rows for component in row.get('funnel', {}).get('components', [])]
        candidates = [(row, candidate) for row in rows for candidate in row.get('funnel', {}).get('candidates', [])]
        if not components:
            continue
        chosen = []
        rejected = [(row, part) for row, part in components if part.get('rejection') and len(part['skeletonIndices']) >= 3]
        rejected = [(row, part) for row, part in rejected if len(part['skeletonIndices']) >= 10
                    and np.hypot(part['bbox']['maxX'] - part['bbox']['minX'],
                                 part['bbox']['maxY'] - part['bbox']['minY']) / (GRID - 1) <= .12]
        if rejected:
            row, part = min(rejected, key=lambda pair: (len(pair[1]['skeletonIndices']), pair[0]['timeSeconds']))
            chosen.append((row, part, 'small rejected component', 'component'))
        row, part = max(components, key=lambda pair: len(pair[1].get('supportedComponentIndices', [])))
        chosen.append((row, part, 'broadest supported component', 'component'))
        pruned = [(row, part) for row, part in components if part.get('unretainedSkeletonPixels', 0) > 0]
        if pruned:
            row, part = max(pruned, key=lambda pair: pair[1].get('unretainedSkeletonPixels', 0))
            chosen.append((row, part, 'most unretained skeleton pixels', 'component'))
        curved = [(row, candidate) for row, candidate in candidates if len(candidate.get('path', [])) >= 3]
        if curved:
            row, candidate = max(curved, key=lambda pair: path_turn(pair[1]['path']))
            part = next((item for item in row.get('funnel', {}).get('components', [])
                         if item.get('candidateSourceIndex') == candidate['source']['index']), {})
            chosen.append((row, {**part, 'selectedCandidate': candidate}, 'largest observed path turn sum', 'candidate'))
        if not chosen:
            continue
        fig, axes = plt.subplots(1, len(chosen), figsize=(4 * len(chosen), 4.5), squeeze=False)
        seed_meta = []
        for ax, (row, part, label, kind) in zip(axes[0], chosen):
            if kind == 'candidate':
                candidate = part['selectedCandidate']
                skeleton = part.get('skeletonIndices', [])
                retained, principal = candidate.get('networkIndices', []), candidate.get('path', [])
            else:
                skeleton = part.get('skeletonIndices', [])
                candidate = next((item for item in row.get('funnel', {}).get('candidates', [])
                                  if item.get('source', {}).get('index') == part.get('candidateSourceIndex')), None)
                retained = candidate.get('networkIndices', []) if candidate else []
                principal = candidate.get('path', []) if candidate else []
            support = np.asarray(part.get('supportedComponentIndices', []), dtype=int)
            for indices, color, legend, size in [(support, '#d9d9d9', 'supported area', 5),
                                                  (skeleton, '#7c8790', 'supported skeleton', 7),
                                                  (retained, '#3979a8', 'retained network', 10),
                                                  (principal, '#c43b35', 'principal path', 14)]:
                indices = np.asarray(indices, dtype=int)
                if indices.size and (np.any(indices < 0) or np.any(indices >= GRID * GRID)):
                    raise ValueError('candidate index outside fixed 96x96 world grid')
                if indices.size:
                    ax.scatter((indices % GRID) / (GRID - 1), (indices // GRID) / (GRID - 1),
                               s=size, color=color, label=legend)
            world_axes(ax); ax.set_title(f'{label}\n{row["timeSeconds"]:g}s', fontsize=8)
            seed_meta.append({'seed': seed, 'seconds': row['timeSeconds'], 'selector': label,
                              'skeletonPixels': len(skeleton), 'retainedNetworkPixels': len(retained),
                              'principalPathPixels': len(principal), 'rejection': part.get('rejection'),
                              'bboxDiagonalWorldUnits': float(np.hypot(part['bbox']['maxX'] - part['bbox']['minX'],
                                                                       part['bbox']['maxY'] - part['bbox']['minY']) / (GRID - 1))
                              if part.get('bbox') else None})
        fig.legend(handles=[Line2D([], [], marker='o', linestyle='', color=color, label=legend, markersize=5)
                            for color, legend in [('#d9d9d9', 'supported area'), ('#7c8790', 'supported skeleton'),
                                                  ('#3979a8', 'retained network'), ('#c43b35', 'principal path')]],
                   loc='lower center', bbox_to_anchor=(.5, .01), ncol=4, fontsize=7)
        fig.suptitle(f'Observed supported skeleton and retained material network · seed {seed}', y=.99)
        fig.subplots_adjust(left=.04, right=.99, top=.82, bottom=.24, wspace=.25)
        fig.savefig(out / f'candidate-seed{seed}.png', dpi=170); plt.close(fig)
        selected.extend(seed_meta)
    return selected


def path_turn(indices):
    points = np.column_stack((np.asarray(indices) % GRID, np.asarray(indices) // GRID)).astype(float)
    vectors = np.diff(points, axis=0)
    angles = np.arctan2(vectors[:, 1], vectors[:, 0])
    turns = np.diff(angles)
    turns = np.arctan2(np.sin(turns), np.cos(turns))
    return float(np.abs(turns).sum())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='combined package data directory')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    files = {'movement': args.input / 'movement.json.gz', 'plates': args.input / 'plates.json.gz',
             'retention': args.input / 'retention.json.gz'}
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise FileNotFoundError('Missing input artifact(s): ' + ', '.join(missing))
    data = {name: read_json(path) for name, path in files.items()}
    args.output.mkdir(parents=True, exist_ok=True)
    snapshots = decode_snapshots(args.input)
    selected = {'movement': plot_movement(data['movement'], args.output),
                'plates': plot_plates(data['plates'], args.output),
                'fields': {'trafficCheckpoints': plot_retention(data['retention'], args.output),
                           'snapshots': plot_field_snapshots(snapshots, args.output)},
                'candidates': plot_candidates(args.input, args.output)}
    outputs = sorted(path.name for path in args.output.glob('*.png'))
    replay_inputs = sorted([*args.input.glob('seed*-summary.json.gz'), *args.input.glob('seed*-snapshots.bin.gz')])
    metadata = {'schemaVersion': 1, 'inputSha256': {**{name: sha256(path) for name, path in files.items()},
                **{path.name: sha256(path) for path in replay_inputs}},
                'plotterSha256': sha256(Path(__file__)),
                'outputs': outputs, 'fixedScales': {'worldX': WORLD, 'worldY': WORLD, 'aspect': 'equal',
                'fieldLimits': FIELD_LIMITS, 'movementAggregateTortuosityY': selected['movement']['aggregateTortuosityY'],
                'contactCountLimits': selected['fields']['snapshots']['contactCountLimits'],
                'checkpointSeconds': CHECKPOINTS,
                'candidateRejectedSelector': {'minimumSkeletonPixels': 10, 'maximumBboxDiagonalWorldUnits': 0.12,
                                              'examples': [item for item in selected['candidates']
                                                           if item['selector'] == 'small rejected component']}},
                'selectedExamples': selected,
                'interpretation': 'Descriptive summaries and actual examples from three archived natural seeds. Selected examples are labeled by their continuous metric selector; no example establishes a morphology class or causal mechanism.'}
    (args.output / 'plot-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
