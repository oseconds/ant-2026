#!/usr/bin/env python3
"""Fixed-scale descriptive plots for local-accretion shadow analysis JSON."""
import argparse
import gzip
import hashlib
import json
import time
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np

GRID = 96
CELLS = GRID * GRID
WORLD = (0.0, 1.0)
TIME = (0.0, 600.0)
MATURITY = (-1.0, 20.0)
FIELD = (0.0, 1.0)
SEEDS = (20261005, 20261006, 20261007)
COLORS = ('#267b9b', '#d17a32', '#8064a2')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_input(path):
    source = path.read_bytes()
    raw = source
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    return json.loads(raw), sha256(source)


def grid(values, label, *, low=None, high=None, integer=False):
    array = np.asarray(values)
    if array.size != CELLS or array.ndim != 1:
        raise ValueError(f'{label}: expected {CELLS} row-major cells')
    array = array.astype(float).reshape(GRID, GRID)
    if not np.isfinite(array).all():
        raise ValueError(f'{label}: values must be finite')
    if low is not None and np.any(array < low) or high is not None and np.any(array > high):
        raise ValueError(f'{label}: values outside [{low}, {high}]')
    if integer and np.any(array != np.floor(array)):
        raise ValueError(f'{label}: values must be integers')
    return array


def validate_events(rows, label):
    event_times = []
    for event in rows:
        seconds = float(event['timeSeconds'])
        event_times.append(seconds)
        cells, new, overlap = (event[name] for name in ('cells', 'newCells', 'overlapCells'))
        if any(not isinstance(value, int) for value in (cells, new, overlap)):
            raise ValueError(f'{label}: cell counts must be integers')
        if not 1 <= cells <= CELLS or min(new, overlap) < 0 or new > cells or overlap > cells or new + overlap != cells:
            raise ValueError(f'{label}: require 1 <= cells <= {CELLS} and new + overlap = cells')
        fraction = float(event['priorOverlapFraction'])
        if not np.isfinite(fraction) or not 0 <= fraction <= 1:
            raise ValueError(f'{label}: priorOverlapFraction must be in [0,1]')
        if 'cellIndices' in event:
            indices = event['cellIndices']
            if (len(indices) != cells or any(not isinstance(index, int) or index < 0 or index >= CELLS
                                             for index in indices) or len(set(indices)) != len(indices)):
                raise ValueError(f'{label}: cellIndices must be unique valid grid indices matching cells')
    if not all(np.isfinite(event_times)) or any(b < a for a, b in zip(event_times, event_times[1:])):
        raise ValueError(f'{label}: event times must be monotonic within [0,600]')
    if any(seconds < TIME[0] or seconds > TIME[1] for seconds in event_times):
        raise ValueError(f'{label}: event time outside fixed [0,600] seconds')


def validate(data):
    if data.get('schemaVersion') != 1 or len(data.get('seeds', [])) != 3:
        raise ValueError('expected schemaVersion 1 with exactly three seeds')
    if tuple(row.get('seed') for row in data['seeds']) != SEEDS:
        raise ValueError('seeds must be 20261005, 20261006, 20261007 in order')
    for seed in data['seeds']:
        history = seed.get('history', [])
        if len(history) != 599:
            raise ValueError(f"seed {seed['seed']}: expected 599 history rows")
        times = [float(row['timeSeconds']) for row in history]
        if not all(np.isfinite(times)) or any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError(f"seed {seed['seed']}: history times must increase")
        for row in history:
            if row['timeSeconds'] < TIME[0] or row['timeSeconds'] > TIME[1]:
                raise ValueError('history time outside fixed [0,600] seconds')
            for side in ('shadow', 'production'):
                for key in ('occupiedCells', 'newCells', 'episodeCount'):
                    value = row[side][key]
                    if not isinstance(value, int) or value < 0 or (key != 'episodeCount' and value > CELLS):
                        raise ValueError(f'{side}.{key} must be a non-negative integer within grid bounds')
        if len(seed.get('milestones', [])) != 3:
            raise ValueError(f"seed {seed['seed']}: expected three milestones")
        for key in ('episodes', 'productionEpisodes'):
            event_rows = seed.get(key, [])
            validate_events(event_rows, key)
        for item in seed['milestones']:
            for key in ('chemicalMemory', 'mechanicalSupport'):
                grid(item[key], key, low=0, high=1)
            grid(item['materializationState'], 'materializationState', low=-1, high=20)
            for key in ('shadowMask', 'productionMask', 'trafficMask'):
                grid(item[key], key, low=0, high=1, integer=True)
            for key in ('shadowFirstFrozenTime', 'productionFirstFrozenTime'):
                grid(item[key], key, low=-1, high=600)
            if item['sampledSeconds'] < TIME[0] or item['sampledSeconds'] > TIME[1]:
                raise ValueError('sampled milestone outside fixed [0,600] seconds')
    return data


def axes_world(ax):
    ax.set(xlim=WORLD, ylim=WORLD, xlabel='World x', ylabel='World y')
    ax.set_aspect('equal', adjustable='box')


def imshow_grid(ax, values, limits, cmap, label):
    image = ax.imshow(values, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest',
                      vmin=limits[0], vmax=limits[1], cmap=cmap)
    axes_world(ax)
    return image


def milestone_label(row):
    return (f"req {row['requestedSeconds']:g}s · obs {row['sampledSeconds']:.3f}s "
            f"({row['offsetSeconds']:+.3f}s)")


def plot_seed(seed, out):
    seed_id = seed['seed']
    milestones = seed['milestones']
    fig, axes = plt.subplots(3, 4, figsize=(14, 10))
    mask_cmap = ListedColormap(['#f4f1ea', '#507f68', '#d17a32', '#5b6f9d'])
    for ri, row in enumerate(milestones):
        shadow = grid(row['shadowMask'], 'shadowMask', low=0, high=1, integer=True).astype(bool)
        production = grid(row['productionMask'], 'productionMask', low=0, high=1, integer=True).astype(bool)
        local_time = grid(row['shadowFirstFrozenTime'], 'shadowFirstFrozenTime', low=-1, high=600)
        prod_time = grid(row['productionFirstFrozenTime'], 'productionFirstFrozenTime', low=-1, high=600)
        sample = float(row['sampledSeconds'])
        local_age = np.where(local_time < 0, -1, np.maximum(0, sample - local_time))
        prod_age = np.where(prod_time < 0, -1, np.maximum(0, sample - prod_time))
        age_cmap = plt.get_cmap('viridis').copy()
        age_cmap.set_bad('#f4f1ea')
        imshow_grid(axes[ri, 0], np.ma.masked_where(local_time < 0, local_age), TIME, age_cmap,
                    'Local first-freeze age')
        imshow_grid(axes[ri, 1], np.ma.masked_where(prod_time < 0, prod_age), TIME, age_cmap,
                    'Production first-freeze age')
        classes = np.where(shadow & production, 1, np.where(shadow, 2, np.where(production, 3, 0)))
        imshow_grid(axes[ri, 2], classes, (0, 3), mask_cmap, 'History comparison')
        traffic = grid(row['trafficMask'], 'trafficMask', low=0, high=1, integer=True).astype(bool)
        overlay = np.zeros((GRID, GRID, 4), dtype=float)
        overlay[shadow] = (0.20, 0.45, 0.34, 0.75)
        overlay[traffic & ~shadow] = (0.82, 0.16, 0.17, 0.9)
        axes[ri, 3].imshow(overlay, origin='lower', extent=(0, 1, 0, 1), interpolation='nearest')
        axes_world(axes[ri, 3])
        for ci, title in enumerate(('Local first-freeze age (s)', 'Production first-freeze age (s)',
                                    'Shared / local-only / production-only', 'Local history + recent traffic')):
            axes[ri, ci].set_title(title if ri == 0 else '')
        axes[ri, 0].set_ylabel(f"{milestone_label(row)}\nWorld y")
    fig.colorbar(plt.cm.ScalarMappable(norm=plt.Normalize(*TIME), cmap='viridis'),
                 cax=fig.add_axes([.505, .20, .012, .62]))
    from matplotlib.lines import Line2D
    fig.legend(handles=[Line2D([], [], marker='s', linestyle='', color=c, label=l) for c, l in
                        [('#507f68', 'Shared mask / local history'), ('#d17a32', 'Local-only mask'),
                         ('#5b6f9d', 'Production-only mask'), ('#d1292b', 'Recent traffic outside local history')]],
               loc='lower center', bbox_to_anchor=(.5, .035), ncol=2, fontsize=8)
    fig.subplots_adjust(left=.07, right=.99, top=.90, bottom=.18, wspace=.38, hspace=.35)
    fig.suptitle(f'Seed {seed_id}: shadow batches (not Plates) vs production Plate history; age [0,600] s, empty cream; world [0,1]²')
    name = f'material-history-seed{seed_id}.png'
    fig.savefig(out / name, dpi=160)
    plt.close(fig)

    fig, axes = plt.subplots(3, len(milestones), figsize=(12, 9), constrained_layout=True)
    images = []
    for ci, row in enumerate(milestones):
        images.append(imshow_grid(axes[0, ci], grid(row['chemicalMemory'], 'chemicalMemory', low=0, high=1),
                                  FIELD, 'viridis', 'Chemical memory'))
        imshow_grid(axes[1, ci], grid(row['mechanicalSupport'], 'mechanicalSupport', low=0, high=1),
                    FIELD, 'viridis', 'Mechanical support')
        imshow_grid(axes[2, ci], grid(row['materializationState'], 'materializationState', low=-1, high=20),
                    MATURITY, 'magma', 'Materialization state')
        axes[0, ci].set_title(milestone_label(row), fontsize=8)
    for ri, title in enumerate(('Chemical memory [0,1]', 'Mechanical support [0,1]',
                                'Materialization state; empty −1, mature 0–20')):
        axes[ri, 0].text(-.35, .5, title, rotation=90, va='center', ha='center', transform=axes[ri, 0].transAxes)
    fig.colorbar(plt.cm.ScalarMappable(norm=plt.Normalize(*FIELD), cmap='viridis'), ax=axes[:2, :],
                 shrink=.75, label='Fixed [0,1]')
    fig.colorbar(plt.cm.ScalarMappable(norm=plt.Normalize(*MATURITY), cmap='magma'), ax=axes[2, :],
                 shrink=.75, label='Fixed [−1,20]')
    fig.suptitle(f'Seed {seed_id}: observed fields and local materialization state')
    name2 = f'field-state-seed{seed_id}.png'
    fig.savefig(out / name2, dpi=160)
    plt.close(fig)
    return [name, name2]


def plot_growth(data, out):
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    for si, seed in enumerate(data['seeds']):
        times = [row['timeSeconds'] for row in seed['history']]
        for ax, key, title in zip(axes[:2], ('occupiedCells', 'newCells'),
                                  ('Occupied cells', 'New cells per analysis')):
            for side, style, label in (('shadow', '-', 'Local shadow'), ('production', '--', 'Production')):
                ax.plot(times, [row[side][key] for row in seed['history']], color=COLORS[si],
                        linestyle=style, linewidth=1, label=f'{seed["seed"]} {label}')
            ax.set(xlim=TIME, xlabel='Simulation seconds', title=title)
            ax.grid(alpha=.2)
        event_ax = axes[2]
        for side, events, style, label in (
                ('shadow', seed['episodes'], '-', 'Shadow materialization batches (not Plates)'),
                ('production', seed['productionEpisodes'], '--', 'Production Plate births')):
            event_times = np.asarray([event['timeSeconds'] for event in events], dtype=float)
            event_ax.plot(times, np.searchsorted(event_times, times, side='right'), color=COLORS[si],
                          linestyle=style, linewidth=1, label=f'{seed["seed"]} {label}')
        event_ax.set(xlim=TIME, xlabel='Simulation seconds', title='Cumulative events: batches vs Plates')
        event_ax.grid(alpha=.2)
    axes[0].set_ylabel('Cells')
    axes[0].set_ylim(0, CELLS)
    axes[1].set_ylim(0, CELLS)
    from matplotlib.lines import Line2D
    handles = [Line2D([], [], color=COLORS[i], label=f'Seed {seed["seed"]}')
               for i, seed in enumerate(data['seeds'])]
    handles.extend([Line2D([], [], color='#444444', linestyle='-', label='Local shadow / batches (not Plates)'),
                    Line2D([], [], color='#444444', linestyle='--', label='Production / actual Plate births')])
    fig.legend(handles=handles, loc='center left', bbox_to_anchor=(.83, .5), fontsize=8)
    fig.tight_layout(rect=(0, 0, .82, .92))
    fig.suptitle('Descriptive growth and episode histories; shared fixed scales across seeds')
    name = 'growth-novelty-timecurves.png'
    fig.savefig(out / name, dpi=160)
    plt.close(fig)
    return name


def self_check():
    values = np.full(CELLS, -1)
    assert grid(values, 'fixture', low=-1, high=20).shape == (GRID, GRID)
    bad = values.copy()
    bad[0] = 21
    try:
        grid(bad, 'bad fixture', low=-1, high=20)
    except ValueError:
        pass
    else:
        raise AssertionError('out-of-range field must fail')
    assert sha256(b'fixture') == hashlib.sha256(b'fixture').hexdigest()
    valid_events = [{'timeSeconds': 1, 'cells': 2, 'newCells': 1, 'overlapCells': 1,
                     'priorOverlapFraction': .5, 'cellIndices': [0, 1]},
                    {'timeSeconds': 2, 'cells': 1, 'newCells': 1, 'overlapCells': 0,
                     'priorOverlapFraction': 0, 'cellIndices': [2]}]
    validate_events(valid_events, 'fixture')
    try:
        validate_events([dict(valid_events[0], cellIndices=[0, 0])], 'bad fixture')
    except ValueError:
        pass
    else:
        raise AssertionError('duplicate cell index must fail')
    print('self-check passed: fixed grid, range rejection, variable event list, duplicate-index rejection, SHA-256')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='analysis.json or gzip-compressed analysis.json.gz')
    parser.add_argument('--output', type=Path, help='output directory for PNG plots and metadata')
    parser.add_argument('--self-check', action='store_true', help='run synthetic assertions without reading archive data')
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.input or not args.output:
        parser.error('--input and --output are required unless --self-check is used')
    start = time.perf_counter()
    data, input_hash = load_input(args.input)
    validate(data)
    args.output.mkdir(parents=True, exist_ok=True)
    outputs = [filename for seed in data['seeds'] for filename in plot_seed(seed, args.output)]
    outputs.append(plot_growth(data, args.output))
    source_hash = sha256(Path(__file__).read_bytes())
    metadata = {
        'schemaVersion': 1, 'input': str(args.input), 'inputSha256': input_hash,
        'plotterSha256': source_hash, 'outputs': outputs,
        'runtimeSeconds': round(time.perf_counter() - start, 6),
        'fixedScales': {'worldX': WORLD, 'worldY': WORLD, 'aspect': 'equal',
                        'chemicalMemory': FIELD, 'mechanicalSupport': FIELD,
                        'materializationState': MATURITY, 'timeSeconds': TIME,
                        'freezeAgeSeconds': TIME},
        'sampleTimes': [{'seed': seed['seed'], 'requestedSeconds': row['requestedSeconds'],
                         'sampledSeconds': row['sampledSeconds'], 'offsetSeconds': row['offsetSeconds']}
                        for seed in data['seeds'] for row in seed['milestones']],
        'interpretation': 'Descriptive fixed-scale plots of observed arrays and supplied summaries; no causal or biological mechanism claim.',
        'eventUnits': {'episodes': 'nonempty shadow materialization batches; not production Plates',
                       'productionEpisodes': 'actual production Plate births'}
    }
    (args.output / 'plot-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
