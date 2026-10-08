#!/usr/bin/env python3
"""Deterministic fixed-scale plots for the detached W1 continuity archive."""
import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams['svg.hashsalt'] = 'ant-w1-continuity-diagnostic'

SEEDS = [20261005, 20261006, 20261007]
GRID = 96
CELLS = GRID * GRID
LIMITS = (0.0, 1.0)
COLORS = ['#426b7a', '#bd7441', '#766c91']
TARGETS = (120, 300, 480, 599.25)
MAX_OVERLAP_WITNESSES_PER_EDGE = 64


def read_input(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    if data.get('schemaVersion') != 1 or [s.get('seed') for s in data.get('seeds', [])] != SEEDS:
        raise ValueError('expected continuity schema v1 with three canonical seeds')
    for seed in data['seeds']:
        frames = seed.get('frames')
        if not frames or any(frames[i]['frameIndex'] >= frames[i + 1]['frameIndex'] for i in range(len(frames) - 1)):
            raise ValueError(f"invalid ordered frame archive for seed {seed['seed']}")
        if any(not np.isfinite(float(f['timeSeconds'])) for f in frames):
            raise ValueError(f"non-finite frame time for seed {seed['seed']}")
    return data


def cell_indices(values, label):
    indices = np.asarray(values, dtype=np.int64)
    if indices.ndim != 1 or np.any(indices < 0) or np.any(indices >= CELLS) or len(np.unique(indices)) != len(indices):
        raise ValueError(f'invalid {label} cell indices')
    return indices


def mask_from(indices, label):
    mask = np.zeros(CELLS, dtype=np.uint8)
    mask[cell_indices(indices, label)] = 1
    return mask


def save(fig, out, stem):
    fig.savefig(out / f'{stem}.png', dpi=160, metadata={'Software': 'ant-w1-continuity-plots'})
    fig.savefig(out / f'{stem}.svg', metadata={'Date': None, 'Creator': 'ant-w1-continuity-plots'})
    plt.close(fig)


def plot_area_timeline(seeds, out):
    max_components = max(f['activeComponentCount'] for seed in seeds for f in seed['frames'])
    max_ancestry = max((lineage['ancestryCount'] for seed in seeds for f in seed['frames']
                        for lineage in f['openLineages']), default=1)
    fig, axes = plt.subplots(len(seeds), 4, figsize=(18, 9), squeeze=False, constrained_layout=True, sharex='col')
    dominant_rows = []
    for i, seed in enumerate(seeds):
        frames = seed['frames']
        t = np.asarray([f['timeSeconds'] for f in frames], dtype=float)
        active = np.asarray([f['activeCellCount'] / CELLS for f in frames])
        pending = np.asarray([f['pendingCellCount'] / CELLS for f in frames])
        dom_id = (seed.get('retrospectiveFinalDominant') or {}).get('id')
        dom_area, dom_ancestry, dom_components = [], [], []
        for frame in frames:
            lineage = next((x for x in frame['openLineages'] if x['id'] == dom_id), None) if dom_id is not None else None
            dom_area.append(lineage['cumulativeArea'] / CELLS if lineage else 0.0)
            dom_ancestry.append(lineage['ancestryCount'] if lineage else 0)
            dom_components.append(sum(node['episodeId'] == dom_id for node in frame['components']))
        dominant_rows.append({'seed': seed['seed'], 'selection': 'retrospective final dominant episode id',
                              'id': dom_id, 'firstObservedSeconds': next((f['timeSeconds'] for f in frames
                                  if any(x['id'] == dom_id for x in f['openLineages'])), None),
                              'finalCumulativeAreaCells': (seed.get('retrospectiveFinalDominant') or {}).get('cumulativeArea'),
                              'finalAncestryCount': len((seed.get('retrospectiveFinalDominant') or {}).get('ancestryIds', []))})
        axes[i, 0].plot(t, active, color=COLORS[i], label='Instantaneous active')
        axes[i, 0].plot(t, pending, color='#555555', linestyle='--', label='Cumulative pending union')
        axes[i, 1].plot(t, dom_components, color=COLORS[i])
        axes[i, 2].plot(t, dom_area, color=COLORS[i])
        axes[i, 3].plot(t, dom_ancestry, color=COLORS[i])
        for j in range(4):
            axes[i, j].set_xlim(0, 600); axes[i, j].grid(alpha=.2)
        axes[i, 0].set_ylabel(str(seed['seed']))
    for ax in axes[:, 0]: ax.set_ylim(0, 1)
    for ax in axes[:, 1]: ax.set_ylim(0, max(1, max_components * 1.05))
    for ax in axes[:, 2]: ax.set_ylim(0, 1)
    for ax in axes[:, 3]: ax.set_ylim(0, max(1, max_ancestry * 1.05))
    labels = ['All-lineage area fraction', 'Dominant active components', 'Dominant cumulative area fraction', 'Dominant ancestry IDs']
    for j, label in enumerate(labels):
        axes[0, j].set_title(label)
        axes[-1, j].set_xlabel('Simulation seconds')
    axes[0, 0].legend(fontsize=7)
    fig.suptitle('W1 continuity timeline · retrospective final-dominant episode selected by its final canonical ID')
    save(fig, out, 'area-and-dominant-lineage-timeline')
    return dominant_rows


def event_bin_rows(seed, width=20):
    bins = int(np.ceil(600 / width))
    events = seed.get('events', [])
    rows = []
    for index in range(bins):
        start, end = index * width, min(600, (index + 1) * width)
        selected = [e for e in events if start <= e['timeSeconds'] < end or (index == bins - 1 and e['timeSeconds'] == 600)]
        merges = [e for e in selected if e.get('type') == 'merge']
        rows.append({'seed': seed['seed'], 'binStartSeconds': start, 'binEndSeconds': end,
                     'componentMergeEvents': len(merges),
                     'singleCanonicalParentRejoins': sum(e.get('distinctCanonicalParentCount') == 1 for e in merges),
                     'multipleCanonicalParentMerges': sum(e.get('distinctCanonicalParentCount', 0) > 1 for e in merges),
                     'distinctCanonicalParentsJoined': sum(e.get('distinctCanonicalParentCount', 0) for e in merges),
                     'lineageAbsorptionEvents': sum(e.get('type') == 'merge_absorption' for e in selected),
                     'splitEvents': sum(e.get('type') == 'split' for e in selected),
                     'closureEvents': sum(e.get('type') == 'closure' for e in selected),
                     'discardEvents': sum(e.get('type') == 'discard' for e in selected)})
    return rows


def plot_event_timeline(seeds, out):
    fig, axes = plt.subplots(len(seeds), 2, figsize=(14, 9), squeeze=False, constrained_layout=True,
                             sharex='col', sharey='col')
    summaries = []
    for i, seed in enumerate(seeds):
        rows = event_bin_rows(seed)
        summaries.extend(rows)
        x = np.asarray([r['binStartSeconds'] + 10 for r in rows])
        width = 4
        left = axes[i, 0]
        left.bar(x - width, [r['singleCanonicalParentRejoins'] for r in rows], width=width,
                 color='#777777', label='One canonical parent')
        left.bar(x, [r['multipleCanonicalParentMerges'] for r in rows], width=width,
                 color=COLORS[i], label='Multiple canonical parents')
        left.bar(x + width, [r['lineageAbsorptionEvents'] for r in rows], width=width,
                 color='#aaaaaa', label='Lineage absorption records')
        left.set(ylabel=f"{seed['seed']}\nMerge events / 20 s", xlim=(0, 600))
        right = axes[i, 1]
        right.bar(x - width, [r['splitEvents'] for r in rows], width=width, color='#666666', label='Splits')
        right.bar(x + width, [r['closureEvents'] for r in rows], width=width, color=COLORS[i], label='Closures')
        right.bar(x + 3 * width, [r['discardEvents'] for r in rows], width=width, color='#aaaaaa', label='Discards')
        right.set(ylabel='Events / 20 s', xlim=(0, 600))
        for ax in (left, right): ax.grid(axis='y', alpha=.2)
        if i == 0:
            left.legend(fontsize=6, ncol=1); right.legend(fontsize=6)
    axes[-1, 0].set_xlabel('Simulation seconds · fixed 20 s bins')
    axes[-1, 1].set_xlabel('Simulation seconds · fixed 20 s bins')
    fig.suptitle('Full-horizon event counts · component joins distinguish same-lineage rejoin from multiple canonical parents')
    save(fig, out, 'lineage-events-20s')
    return summaries


def write_event_chronology(seeds, out):
    rows = [dict(event, seed=seed['seed']) if 'seed' not in event else event
            for seed in seeds for event in seed.get('events', [])]
    fields = sorted({key for row in rows for key in row})
    with (out / 'event-chronology.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in sorted(rows, key=lambda e: (e['seed'], e['timeSeconds'], e.get('frameIndex', -1), e['type'])):
            writer.writerow({key: json.dumps(value, separators=(',', ':')) if isinstance(value, (list, dict)) else value
                             for key, value in row.items()})


def plot_checkpoints(seeds, out):
    reps = [('activeCellIndices', 'Instantaneous active'), ('cumulativePendingCellIndices', 'Cumulative pending union'),
            ('recentTrafficCellIndices', 'Actual foot traffic · trailing 20 s'), ('qCellIndices', 'Current q-qualified'),
            ('staleContactCellIndices', 'Stale same-cell contact')]
    selected = []
    for seed in seeds:
        fig, axes = plt.subplots(len(reps), len(TARGETS), figsize=(9, 10), squeeze=False,
                                 constrained_layout=True)
        milestones = seed.get('milestones', [])
        for ti, target in enumerate(TARGETS):
            candidates = [m for m in milestones if m.get('requestedSeconds') == target]
            if not candidates:
                raise ValueError(f"missing {target}s checkpoint masks for seed {seed['seed']}")
            m = candidates[0]
            selected.append({'seed': seed['seed'], 'requestedSeconds': target, 'sampledSeconds': m['sampledSeconds']})
            for ri, (key, label) in enumerate(reps):
                ax = axes[ri, ti]
                if key not in m:
                    ax.text(.5, .5, 'not archived', ha='center', va='center', transform=ax.transAxes)
                    values = []
                else:
                    values = cell_indices(m[key], key)
                    ax.imshow(mask_from(values, key).reshape(GRID, GRID), origin='lower', extent=(0, 1, 0, 1),
                              interpolation='nearest', vmin=0, vmax=1, cmap='Greys')
                ax.set(xlim=LIMITS, ylim=LIMITS)
                ax.set_aspect('equal', adjustable='box')
                ax.set_title(f"{m['sampledSeconds']:g}s · n={len(values)}", fontsize=8)
                ax.set_xlabel('World x'); ax.set_ylabel(label + '\nWorld y', fontsize=8)
                ax.tick_params(labelsize=6)
        fig.suptitle(f"Observed fixed-grid masks · seed {seed['seed']} · world [0,1] × [0,1]\n" +
                     'Rows: active, pending union, recent foot traffic, q-qualified, stale same-cell contact')
        save(fig, out, f"checkpoint-masks-seed{seed['seed']}")
    return selected


def plot_early_timeline(seeds, out):
    max_count = max(max(f['activeComponentCount'], f['openEpisodeCount']) for seed in seeds for f in seed['frames']
                    if f['timeSeconds'] <= 120)
    fig, axes = plt.subplots(len(seeds), 1, figsize=(12, 8), squeeze=False, constrained_layout=True, sharex=True, sharey=True)
    for i, seed in enumerate(seeds):
        ax = axes[i, 0]
        frames = [f for f in seed['frames'] if f['timeSeconds'] <= 120]
        ax.plot([f['timeSeconds'] for f in frames], [f['activeComponentCount'] for f in frames],
                color=COLORS[i], label='Instantaneous components')
        ax.plot([f['timeSeconds'] for f in frames], [f['openEpisodeCount'] for f in frames],
                color='#555555', linestyle='--', label='Open canonical lineages')
        events = [e for e in seed.get('events', []) if e['timeSeconds'] <= 120]
        event_y = max_count * .96
        marks = [('split', '^', '#333333'), ('merge-same-lineage', 'v', '#888888'),
                 ('merge-multiple-lineages', 'D', COLORS[i])]
        for kind, marker, color in marks:
            chosen = [e for e in events if (e.get('type') == 'split' if kind == 'split' else
                      e.get('type') == 'merge' and
                      ((e.get('distinctCanonicalParentCount') == 1) if kind == 'merge-same-lineage' else
                       (e.get('distinctCanonicalParentCount', 0) > 1)))]
            if chosen:
                ax.scatter([e['timeSeconds'] for e in chosen], [event_y] * len(chosen), marker=marker,
                           color=color, s=13, label=f'{kind} · n={len(chosen)}')
        ax.set(xlim=(0, 120), ylim=(0, max(1, max_count * 1.05)), ylabel=f"{seed['seed']}\nCount")
        ax.grid(alpha=.2)
        if i == 0: ax.legend(fontsize=7, ncol=3)
    axes[-1, 0].set_xlabel('Simulation seconds')
    fig.suptitle('Early formation 0–120 s · component and lineage counts with observed split / join events')
    save(fig, out, 'early-lineage-timeline')


def plot_admission_ages(seeds, out):
    fig, axes = plt.subplots(len(seeds), 2, figsize=(10, 8), squeeze=False, constrained_layout=True)
    summaries = []
    bins = np.linspace(0, 600, 31)
    for i, seed in enumerate(seeds):
        admissions = seed.get('admissions', [])
        ages = np.asarray([a['lastActualPointContactAgeSeconds'] for a in admissions
                           if a.get('lastActualPointContactAgeSeconds') is not None], dtype=float)
        if not np.isfinite(ages).all() or np.any(ages < 0):
            raise ValueError(f"invalid admission-to-contact ages for seed {seed['seed']}")
        none_count = sum(a.get('lastActualPointContactAgeSeconds') is None for a in admissions)
        ax = axes[i, 0]
        if len(ages):
            ax.hist(ages, bins=bins, density=True, color=COLORS[i], alpha=.6, edgecolor='white')
            twin = ax.twinx(); ordered = np.sort(ages)
            twin.step(ordered, np.arange(1, len(ordered) + 1) / len(ordered), where='post', color='#222222', linewidth=1)
            twin.set(ylim=(0, 1), ylabel='ECDF')
        else:
            ax.text(.5, .5, 'No prior-contact admissions', ha='center', va='center', transform=ax.transAxes)
        ax.set(xlim=(0, 600), xlabel='Age of last prior same-cell actual FOOT_CONTACT at admission (s)', ylabel='Density',
               title=f"{seed['seed']} · prior contact n={len(ages)}")
        ax.grid(alpha=.15)
        axes[i, 1].bar(['Prior contact', 'No prior contact'], [len(ages), none_count], color=[COLORS[i], '#aaaaaa'])
        axes[i, 1].set(ylabel='Admission count', title=f'Admissions · n={len(admissions)}')
        axes[i, 1].grid(axis='y', alpha=.15)
        summaries.append({'seed': seed['seed'], 'admissionCount': len(admissions), 'priorContactCount': len(ages),
                          'noPriorContactCount': none_count, 'ageSeconds': {'min': float(ages.min()) if len(ages) else None,
                          'median': float(np.median(ages)) if len(ages) else None, 'max': float(ages.max()) if len(ages) else None}})
    fig.suptitle('Contact age at first lineage admission · null means no prior same-cell contact')
    save(fig, out, 'admission-contact-age')
    return summaries


def plot_lineage_overlaps(seeds, out):
    """Show exact consecutive-frame component overlaps in early formation."""
    selections = []
    for seed in seeds:
        frames = [f for f in seed['frames'] if f['timeSeconds'] <= 120]
        events = seed.get('events', [])
        dominant_id = seed['retrospectiveFinalDominant']['id']
        candidates = []
        for event_type in ('split', 'merge'):
            found = next((e for e in events if e.get('type') == event_type and
                          e.get('episodeId') == dominant_id and e['timeSeconds'] <= 120), None)
            if found is not None:
                candidates.append((event_type, found))
        selections.append({'seed': seed['seed'], 'windows': candidates})
    fig, axes = plt.subplots(len(seeds), 2, figsize=(10, 7), squeeze=False, constrained_layout=True)
    for si, seed in enumerate(seeds):
        by_index = {f['frameIndex']: f for f in seed['frames']}
        windows = selections[si]['windows']
        for ci, event_type in enumerate(('split', 'merge')):
            ax = axes[si, ci]
            event = next((item for kind, item in windows if kind == event_type), None)
            chosen = event['frameIndex'] if event is not None else None
            if chosen is None or chosen <= 0 or chosen not in by_index or chosen - 1 not in by_index:
                ax.text(.5, .5, f'No recorded {event_type} witness in first 120 s', ha='center', va='center', transform=ax.transAxes)
                ax.set_axis_off(); continue
            previous, current = by_index[chosen - 1], by_index[chosen]
            old = {c['componentId']: c for c in previous['components']}
            new = {c['componentId']: c for c in current['components']}
            all_edges = current.get('overlapEdges', [])
            if event_type == 'split':
                edge_pairs = {(event['previousComponentId'], child) for child in event['descendantComponentIds']}
            else:
                edge_pairs = {(parent, event['componentId']) for parent in event['previousComponentIds']}
            edges = [e for e in all_edges if (e['previousComponentId'], e['componentId']) in edge_pairs]
            related_old = sorted({e['previousComponentId'] for e in edges})
            related_new = sorted({e['componentId'] for e in edges})
            for side, ids, nodes in ((0, related_old, old), (1, related_new, new)):
                for rank, cid in enumerate(ids):
                    cells = cell_indices(nodes[cid]['cellIndices'], 'component witness')
                    xy = np.column_stack((cells % GRID, cells // GRID))
                    ax.scatter(xy[:, 0] / (GRID - 1) + side * 1.2, xy[:, 1] / (GRID - 1), s=5, marker='s',
                               label=f"{'previous' if side == 0 else 'current'} component {cid}")
            ax.set(xlim=(-.05, 2.4), ylim=(0, 1), xlabel='Previous frame                              Current frame', ylabel='World y')
            ax.set_title(f"{seed['seed']} · {event_type} · {previous['timeSeconds']:.2f}→{current['timeSeconds']:.2f}s")
            ax.set_xticks([0, 1.2], ['previous x', 'current x']); ax.grid(alpha=.15)
            shown_edges = []
            for edge in edges:
                if edge['previousComponentId'] in related_old and edge['componentId'] in related_new:
                    common = sorted(set(old[edge['previousComponentId']]['cellIndices']) &
                                    set(new[edge['componentId']]['cellIndices']))
                    count = min(len(common), MAX_OVERLAP_WITNESSES_PER_EDGE)
                    selected_cells = ([common[k] for k in np.linspace(0, len(common) - 1, count).round().astype(int)]
                                      if count else [])
                    for cell in selected_cells:
                        x, y = (cell % GRID) / (GRID - 1), (cell // GRID) / (GRID - 1)
                        ax.plot([x, x + 1.2], [y, y], color='#555555', linewidth=.45, alpha=.55)
                    shown_edges.append({'previousComponentId': edge['previousComponentId'],
                                        'componentId': edge['componentId'], 'overlapCellCount': len(common),
                                        'plottedCellIndices': selected_cells})
            selections[si].setdefault('selectedEventFrames', []).append({'type': event_type, 'frameIndex': chosen,
                'previousFrameIndex': previous['frameIndex'], 'selectedPreviousComponentIds': related_old,
                'selectedCurrentComponentIds': related_new, 'overlapEdges': shown_edges})
    fig.suptitle('Selected dominant-lineage early split / merge events\nExact occupied cells; links show same-cell identity across observations')
    save(fig, out, 'early-lineage-overlap-witnesses')
    return selections


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('docs/ant/evidence/2026-10-09-w1-continuity-diagnostic/results/analysis.json.gz'))
    parser.add_argument('--output', type=Path, default=Path('docs/ant/evidence/2026-10-09-w1-continuity-diagnostic/plots'))
    args = parser.parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(f'missing continuity analysis artifact: {args.input}')
    data = read_input(args.input)
    args.output.mkdir(parents=True, exist_ok=True)
    dominant = plot_area_timeline(data['seeds'], args.output)
    event_bins = plot_event_timeline(data['seeds'], args.output)
    plot_early_timeline(data['seeds'], args.output)
    checkpoints = plot_checkpoints(data['seeds'], args.output)
    admissions = plot_admission_ages(data['seeds'], args.output)
    witnesses = plot_lineage_overlaps(data['seeds'], args.output)
    write_event_chronology(data['seeds'], args.output)
    outputs = sorted(p for p in args.output.iterdir() if p.suffix in ('.png', '.svg', '.csv'))
    manifest = {'schemaVersion': 1, 'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                'plotterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'seedOrder': SEEDS,
                'grid': [GRID, GRID], 'worldLimits': [0, 1], 'checkpointSelections': checkpoints,
                'retrospectiveDominantLineages': dominant, 'eventBins20s': event_bins,
                'eventChronologyCsv': 'event-chronology.csv',
                'admissionContactAge': admissions, 'selectedEarlyOverlapWitnesses': witnesses,
                'witnessSelection': {'eventRule': 'first split and first merge for the retrospectively selected final dominant canonical ID at or before 120 seconds per seed',
                                     'cellRule': f'sorted exact cell intersections; at most {MAX_OVERLAP_WITNESSES_PER_EDGE} evenly spaced indices per overlap edge'},
                'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs},
                'interpretation': 'Instantaneous active geometry, current open-lineage cumulative union, archived actual-foot traffic, and current q-qualified masks are distinct observations. Component overlap links describe identical occupied cells across consecutive frames; they do not establish causal formation.'}
    (args.output / 'plot-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
