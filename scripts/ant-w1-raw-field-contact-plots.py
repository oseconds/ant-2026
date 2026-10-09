import argparse
import csv
import gc
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = Path('docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit')
GRID = 96
SEEDS = [20261005, 20261006, 20261007]
TARGETS = [120, 300, 480, 599.25]
FIELDS = ['chemicalMemory', 'support', 'surface']
plt.rcParams['svg.hashsalt'] = 'ant-w1-raw-field-contact-history-audit'
plt.rcParams['font.family'] = 'DejaVu Sans'


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def load_checkpoints(path):
    maps = {}
    seen = {}
    times = {}
    with gzip.open(path, 'rt', newline='', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            key = (int(row['seed']), float(row['requestedSeconds']))
            if key not in maps:
                maps[key] = {name: np.zeros((GRID, GRID), dtype=np.float32) for name in [
                    'id0HistoricalUnion', 'currentActive', 'q', 'chemicalMemory', 'support', 'surface',
                    'deltaChemicalMemory', 'deltaSupport', 'deltaSurface', 'contactInPreviousInterval',
                    'contactAgeSeconds', 'cumulativeIndividualFootContacts', 'distinctContactTimestamps']}
                maps[key]['contactAgeSeconds'].fill(np.nan)
                seen[key] = set()
                times[key] = float(row['timeSeconds'])
            elif times[key] != float(row['timeSeconds']):
                raise ValueError(f'inconsistent checkpoint time {key}')
            cell = int(row['cellIndex'])
            x, y = int(row['x']), int(row['y'])
            if not (0 <= cell < GRID * GRID and x == cell % GRID and y == cell // GRID):
                raise ValueError(f'bad cell coordinate {key}:{cell}:{x},{y}')
            if cell in seen[key]:
                raise ValueError(f'duplicate cell row {key}:{cell}')
            seen[key].add(cell)
            for name in maps[key]:
                value = row[name]
                if value:
                    maps[key][name][y, x] = float(value)
    for key, cells in seen.items():
        if len(cells) != GRID * GRID:
            raise ValueError(f'{key} has {len(cells)} cells')
    if len(maps) != len(SEEDS) * len(TARGETS):
        raise ValueError(f'expected 12 checkpoint maps, got {len(maps)}')
    return maps, times


def write_pair(fig, output, stem):
    gc.collect()
    paths = [output / f'{stem}.png', output / f'{stem}.svg']
    fig.savefig(paths[0], format='png', dpi=160, metadata={'Software': 'ANT W1 raw field audit'})
    fig.savefig(paths[1], format='svg', metadata={'Date': None, 'Creator': 'ANT W1 raw field audit'})
    plt.close(fig)
    return paths


def plot_milestones(seed, checkpoint_rows, checkpoint_times, scales, contact_count_max, distinct_count_max, output):
    titles = [
        'Candidate ID 0\nhistorical union', 'Current W1\nactive mask', 'Current W1\nq mask',
        'chemicalMemory\nFloat32, dimensionless', 'support\nFloat32 model scalar',
        'surface\nFloat32 SurfaceField scalar',
        'Last same-cell\ncontact age (s)', 'FOOT_CONTACT\nin prior interval',
        'Δ chemicalMemory\ncurrent − previous', 'Δ support\ncurrent − previous',
        'Δ surface\ncurrent − previous', 'Cumulative individual\nfoot points',
        'Distinct same-cell\ncontact timestamps'
    ]
    binary = ListedColormap(['#f5f4f0', '#163d68'])
    contact_binary = ListedColormap(['#f5f4f0', '#c4472d'])
    mask_specs = {'id0HistoricalUnion', 'currentActive', 'q'}
    delta_specs = {'deltaChemicalMemory', 'deltaSupport', 'deltaSurface'}
    raw_fields = scales['rawFields']
    fig, axes = plt.subplots(4, len(titles), figsize=(26, 9.2), squeeze=False)
    images = {}
    field_names = ['id0HistoricalUnion', 'currentActive', 'q', 'chemicalMemory', 'support', 'surface',
                   'contactAgeSeconds', 'contactInPreviousInterval', 'deltaChemicalMemory', 'deltaSupport',
                   'deltaSurface', 'cumulativeIndividualFootContacts', 'distinctContactTimestamps']
    for row_index, target in enumerate(TARGETS):
        checkpoint = checkpoint_rows[(seed, target)]
        for col, key in enumerate(field_names):
            ax = axes[row_index, col]
            values = checkpoint[key].copy()
            if key in mask_specs:
                cmap, vmin, vmax = binary, 0, 1
            elif key == 'contactInPreviousInterval':
                cmap, vmin, vmax = contact_binary, 0, 1
            elif key == 'contactAgeSeconds':
                values[values < 0] = np.nan
                cmap, vmin, vmax = 'cividis', *scales['contactAgeSeconds']
            elif key in delta_specs:
                field = key.removeprefix('delta')
                field = field[0].lower() + field[1:]
                cmap, vmin, vmax = 'coolwarm', *scales['deltaFields'][field]
            elif key in raw_fields:
                cmap, vmin, vmax = 'viridis', *raw_fields[key]
            elif key == 'cumulativeIndividualFootContacts':
                cmap, vmin, vmax = 'magma', 0, contact_count_max
            else:
                cmap, vmin, vmax = 'magma', 0, distinct_count_max
            image = ax.imshow(values, origin='lower', extent=(-0.5, GRID - 0.5, -0.5, GRID - 0.5),
                              interpolation='nearest', aspect='equal', cmap=cmap, vmin=vmin, vmax=vmax)
            images[key] = image
            ax.set_xlim(-0.5, GRID - 0.5)
            ax.set_ylim(-0.5, GRID - 0.5)
            ax.set_xticks([])
            ax.set_yticks([])
            if row_index == 0:
                title = titles[col]
                if key in raw_fields:
                    title += f'\n[{vmin:.7g}, {vmax:.7g}]'
                ax.set_title(title, fontsize=7, pad=4)
            if col == 0:
                ax.set_ylabel(f'{checkpoint_times[(seed, target)]:.3f} s\nrequested {target:g} s', fontsize=7)
    fig.suptitle(f'Seed {seed} · fixed 96×96 cell maps · no interpolation or spatial reconstruction', fontsize=11)
    fig.subplots_adjust(left=0.045, right=0.985, top=0.90, bottom=0.04, wspace=0.11, hspace=0.22)
    for key in ['chemicalMemory', 'support', 'surface', 'contactAgeSeconds', 'deltaChemicalMemory',
                'deltaSupport', 'deltaSurface', 'cumulativeIndividualFootContacts', 'distinctContactTimestamps']:
        column = field_names.index(key)
        fig.colorbar(images[key], ax=axes[:, column].tolist(), orientation='horizontal', fraction=0.035,
                     pad=0.055, aspect=18)
    return write_pair(fig, output, f'field-contact-milestones-seed{seed}')


def plot_distributions(analysis, ranges, output):
    fig, axes = plt.subplots(len(FIELDS), 2, figsize=(12, 8), squeeze=False)
    colors = {'q0': '#6b7280', 'q1': '#b23b2b'}
    scopes = [('world', 'All world cells'), ('candidateId0HistoricalUnion', 'Candidate ID 0 historical union')]
    for row_index, field in enumerate(FIELDS):
        lo, hi = ranges[field]
        edges = np.linspace(lo, hi, analysis['distributionBinCount'] + 1)
        for col, (scope, title) in enumerate(scopes):
            ax = axes[row_index, col]
            for q in [0, 1]:
                counts = np.zeros(analysis['distributionBinCount'], dtype=np.int64)
                for seed in analysis['seeds']:
                    data = seed['distributions'][f'{scope}:{field}:q{q}']
                    counts += np.asarray(data['histogram'], dtype=np.int64)
                ax.stairs(counts, edges, color=colors[f'q{q}'], label=f'q={q}', linewidth=1.5)
            ax.set_title(f'{title} · {field}', fontsize=9)
            ax.set_ylabel('cell samples')
            ax.set_xlabel('raw stored Float32 value')
            ax.legend(frameon=False)
            ax.grid(axis='y', alpha=0.2)
    fig.suptitle('Raw value distributions within unchanged binary qualification states · pooled counts, no normalization', fontsize=11)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return write_pair(fig, output, 'field-distributions-by-q')


def plot_temporal(analysis, output):
    colors = {20261005: '#2166ac', 20261006: '#b2182b', 20261007: '#1b7837'}
    fig, axes = plt.subplots(len(FIELDS), 2, figsize=(13, 9), squeeze=False, sharex=True)
    for row_index, field in enumerate(FIELDS):
        for col, scope in enumerate(['world', 'candidateId0HistoricalUnion']):
            ax = axes[row_index, col]
            for seed in analysis['seeds']:
                series = seed['timeSeries']
                times = [row['timeSeconds'] for row in series]
                base = field if scope == 'world' else f'{field}Id0'
                for q, style in [(0, '--'), (1, '-')]:
                    values = [row[f'{base}Q{q}Mean'] for row in series]
                    ax.plot(times, values, color=colors[seed['seed']], linestyle=style,
                            linewidth=0.8, alpha=0.85, label=f'{seed["seed"]} q={q}')
            ax.set_title(f'{"All world cells" if scope == "world" else "Candidate ID 0 history"} · {field}', fontsize=9)
            ax.set_ylabel('raw field mean')
            ax.grid(alpha=0.2)
            if row_index == 0 and col == 0:
                ax.legend(frameon=False, ncol=2, fontsize=7)
    axes[-1, 0].set_xlabel('archived observation time (s)')
    axes[-1, 1].set_xlabel('archived observation time (s)')
    fig.suptitle('Within-q field means through the frozen run · exact samples, no smoothing', fontsize=11)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return write_pair(fig, output, 'field-temporal-means')


def plot_contact_deltas(analysis, output):
    fig, axes = plt.subplots(1, len(FIELDS), figsize=(14, 4.5), squeeze=False)
    colors = {'contacted': '#b23b2b', 'noContact': '#2166ac'}
    for col, field in enumerate(FIELDS):
        ax = axes[0, col]
        for status in ['contacted', 'noContact']:
            counts = None
            value_range = None
            for seed in analysis['seeds']:
                data = seed['contactDeltaDistributions'][f'{field}:{status}']
                if counts is None:
                    counts = np.zeros(len(data['histogram']), dtype=np.int64)
                    value_range = data['binRange']
                counts += np.asarray(data['histogram'], dtype=np.int64)
            edges = np.linspace(value_range[0], value_range[1], len(counts) + 1)
            ax.stairs(counts, edges, color=colors[status], label=status, linewidth=1.4)
        ax.set_title(f'{field} Δ · pooled counts', fontsize=9)
        ax.set_xlabel('current − previous raw value')
        ax.set_ylabel('cell intervals')
        ax.grid(axis='y', alpha=0.2)
        ax.legend(frameon=False)
    fig.suptitle('Field changes by observed same-cell FOOT_CONTACT in (previous,current] · association only', fontsize=11)
    fig.tight_layout(rect=(0, 0, 1, 0.92))
    return write_pair(fig, output, 'contact-field-delta-distributions')


def plot_history_timeline(analysis, output):
    colors = {20261005: '#2166ac', 20261006: '#b2182b', 20261007: '#1b7837'}
    fig, axes = plt.subplots(3, 2, figsize=(12, 8), squeeze=False, sharex=True)
    for row_index, seed in enumerate(analysis['seeds']):
        rows = seed['timeSeries']
        times = [row['timeSeconds'] for row in rows]
        ax = axes[row_index, 0]
        ax.plot(times, [row['candidateId0HistoricalCellCount'] for row in rows], color='#111827', label='ID 0 historical union')
        ax.plot(times, [row['candidateId0CurrentOwnedActiveCells'] for row in rows], color='#b23b2b', label='ID 0 current active')
        ax.plot(times, [row['qQualifiedCellCount'] for row in rows], color='#2166ac', label='q=1 cells')
        ax.plot(times, [row['currentActiveCellCount'] for row in rows], color='#1b7837', label='current active cells')
        ax.set_ylabel(f'{seed["seed"]}\ncells'); ax.grid(alpha=0.2)
        if row_index == 0:
            ax.legend(frameon=False, ncol=2, fontsize=7)
        ax = axes[row_index, 1]
        ax.plot(times, [row['contactPointsThisInterval'] for row in rows], color=colors[seed['seed']], label='foot points in interval')
        ax.plot(times, [row['contactCellsThisInterval'] for row in rows], color='#111827', linestyle='--', label='cells contacted')
        ax.plot(times, [row['cellsWithAtLeastTwoDistinctContactTimestamps'] for row in rows], color='#b23b2b', label='cells with ≥2 contact times')
        ax.set_ylabel(f'{seed["seed"]}\ncontacts / cells'); ax.grid(alpha=0.2)
        if row_index == 0:
            ax.legend(frameon=False, fontsize=7)
    axes[-1, 0].set_xlabel('archived observation time (s)'); axes[-1, 1].set_xlabel('archived observation time (s)')
    fig.suptitle('Candidate ID 0 history, current predicates, and actual contact recurrence', fontsize=11)
    fig.subplots_adjust(left=0.10, right=0.98, top=0.90, bottom=0.08, hspace=0.30, wspace=0.14)
    return write_pair(fig, output, 'contact-and-qualification-timeline')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=str(ROOT / PACKAGE / 'results'))
    parser.add_argument('--output', default=str(ROOT / PACKAGE / 'plots'))
    args = parser.parse_args()
    input_dir, output_dir = Path(args.input).resolve(), Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = json.loads((input_dir / 'summary.json').read_text(encoding='utf-8'))
    with gzip.open(input_dir / 'analysis.json.gz', 'rt', encoding='utf-8') as handle:
        analysis = json.load(handle)
    maps, checkpoint_times = load_checkpoints(input_dir / 'checkpoint-cells.csv.gz')
    raw_scales = summary['displayScales']['rawFields']
    scales = {'rawFields': {field: raw_scales[field] for field in FIELDS},
              'deltaFields': summary['displayScales']['deltaFields'],
              'contactAgeSeconds': summary['displayScales']['contactAgeSeconds']}
    contact_count_max = int(summary['fields']['contactCounts']['range'][1])
    distinct_count_max = max(int(grid.max()) for (seed, target), rows in maps.items()
                             for grid in [rows['distinctContactTimestamps']])
    files = []
    for seed in SEEDS:
        print(f'plotting milestone maps for seed {seed}', flush=True)
        files.extend(plot_milestones(seed, maps, checkpoint_times, scales, contact_count_max, distinct_count_max, output_dir))
    print('plotting pooled distributions', flush=True)
    files.extend(plot_distributions(analysis, raw_scales, output_dir))
    print('plotting temporal means', flush=True)
    files.extend(plot_temporal(analysis, output_dir))
    print('plotting contact-delta distributions', flush=True)
    files.extend(plot_contact_deltas(analysis, output_dir))
    print('plotting history timeline', flush=True)
    files.extend(plot_history_timeline(analysis, output_dir))
    unique_files = sorted(set(files), key=lambda path: path.name)
    input_hashes = {name: digest(input_dir / name) for name in [
        'analysis.json.gz', 'summary.json', 'checkpoint-cells.csv.gz', 'field-distributions.csv',
        'time-series.csv', 'contact-interval-contrasts.csv']}
    manifest = {'schemaVersion': 1, 'grid': {'width': GRID, 'height': GRID, 'extent': [0, 95, 0, 95],
                'cellRepresentation': 'archived cells only; nearest display; no interpolation or connected paths'},
        'targets': TARGETS, 'seedOrder': SEEDS,
        'rawFieldDisplayRanges': scales['rawFields'], 'deltaDisplayRanges': scales['deltaFields'],
        'contactAgeDisplayRangeSeconds': scales['contactAgeSeconds'],
        'contactPointDisplayRange': [0, contact_count_max],
        'distinctTimestampDisplayRange': [0, distinct_count_max],
        'distributionHistograms': {'binCount': analysis['distributionBinCount'], 'countsNormalized': False},
        'inputSha256': input_hashes,
        'files': [{'path': path.name, 'bytes': path.stat().st_size, 'sha256': digest(path)} for path in unique_files]}
    (output_dir / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'plots': len(unique_files), 'manifest': str(output_dir / 'plot-manifest.json'),
                      'checkpointMaps': len(maps), 'grid': [GRID, GRID]}, separators=(',', ':')))


if __name__ == '__main__':
    main()
