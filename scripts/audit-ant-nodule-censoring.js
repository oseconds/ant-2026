import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SOURCE_DATA_DIR = path.join(REPO_ROOT,
  'docs/ant/evidence/2026-10-13-nodule-zero-gap-lineage/data');
const PERSISTENCE_MS = 30_000;
const COMPACTION_THRESHOLD = 0.55;
const SURFACE_HALF_LIFE_SECONDS = 1800;
const GRID_SIZE = 96;
const SIMULATION_HZ = 60;
const TICK_MS = 1000 / SIMULATION_HZ;

export function auditNoduleCensoring(seedEvidence) {
  const cells = [];
  const perSeed = [];
  let lastSavedEvaluationMs = 0;

  for (const seedRecord of seedEvidence) {
    const armCells = {};
    for (const armName of ['natural', 'timerClear']) {
      const arm = seedRecord.arms[armName];
      const boundaries = arm.evaluationBoundaries;
      const finalBoundary = boundaries.at(-1);
      lastSavedEvaluationMs = Math.max(lastSavedEvaluationMs, finalBoundary.timeMs);
      const maxCountBlocked = boundaries.some((row) => row.maxNodulesReached);
      const transitionRows = arm.qualificationEnabledTransitions;
      const seenCells = new Set();
      const records = [];

      for (const transition of transitionRows) {
        if (seenCells.has(transition.cell)) {
          throw new Error(`Duplicate qualification transition for seed ${seedRecord.seed}, ${armName}, cell ${transition.cell}`);
        }
        seenCells.add(transition.cell);

        const firstEvaluation = boundaries.find((row) => row.timeMs > transition.timeMs);
        if (!firstEvaluation) throw new Error(`No post-Plate evaluation for cell ${transition.cell}`);
        const laterPlates = arm.gapPlateDescriptors.filter((plate) =>
          plate.bornAtSimulationTimeMs > transition.timeMs);
        const cellBirth = arm.births.find((birth) => birth.cell === transition.cell);
        const nominalOpportunityMs = finalBoundary.timeMs - firstEvaluation.timeMs;
        const ticksToFirstEvaluation = Math.round((firstEvaluation.timeMs - transition.timeMs) / TICK_MS);
        const ticksToEnd = Math.round((finalBoundary.timeMs - transition.timeMs) / TICK_MS);
        const ticksToMaturity = ticksToFirstEvaluation + SIMULATION_HZ * (PERSISTENCE_MS / 1000);
        const projectedCompactionAtMaturity = relaxFloat32(transition.sampledCompaction, ticksToMaturity);
        const projectedCompactionAtEnd = relaxFloat32(transition.sampledCompaction, ticksToEnd);

        let primaryClassification = 'DATA INSUFFICIENT';
        let primaryReason = 'Cellwise timer events, later Plate coverage, and proximity results were not retained.';
        let classificationBasis = 'unresolved_from_committed_evidence';

        if (cellBirth) {
          throw new Error(`Plate-enabled target cell ${transition.cell} unexpectedly appears in Nodule births`);
        }

        if (!maxCountBlocked && projectedCompactionAtMaturity < COMPACTION_THRESHOLD) {
          primaryClassification = 'QUALIFICATION LOST';
          primaryReason = 'No-contact compaction decay puts this cell below threshold before the earliest possible 30 s persistence boundary; a later Plate cannot restore compaction.';
          classificationBasis = 'derived_from_saved_enable_value_and_production_decay_law';
        } else if (!maxCountBlocked && laterPlates.length === 0
          && nominalOpportunityMs < PERSISTENCE_MS
          && projectedCompactionAtEnd > COMPACTION_THRESHOLD) {
          primaryClassification = 'RIGHT-CENSORED';
          primaryReason = 'The candidate starts at the first eligible one-second evaluation, remains qualified, has no later Plate reset, and the last gap evaluation arrives before 30 s.';
          classificationBasis = 'reconstructed_from_saved_timing_and_production_gates';
        } else if (!maxCountBlocked && laterPlates.length === 0
          && nominalOpportunityMs >= PERSISTENCE_MS
          && projectedCompactionAtMaturity > COMPACTION_THRESHOLD) {
          primaryClassification = 'NEARBY-NODULE BLOCKED';
          primaryReason = 'The candidate reaches the 30 s gate while qualified, no later Plate can reset it, and no Nodule is born; with max-count false, production semantics leave proximity as the blocking gate.';
          classificationBasis = 'inferred_from_exhaustive_production_birth_gates_no_nearby_id_saved';
        }

        const record = {
          seed: seedRecord.seed,
          arm: armName,
          cell: transition.cell,
          coordinate: {
            x: (transition.cell % GRID_SIZE) / (GRID_SIZE - 1),
            y: Math.floor(transition.cell / GRID_SIZE) / (GRID_SIZE - 1)
          },
          enablingPlateId: transition.plateId,
          qualificationEnableTimeMs: transition.timeMs,
          layerCountBefore: transition.layerCountBefore,
          layerCountAfter: transition.layerCountAfter,
          sampledCompactionAtEnable: transition.sampledCompaction,
          retainedLocalFootLoadAtEnable: transition.retainedFootLoad,
          timerAtPlateAddBeforeAdvance: transition.timerBeforeMs,
          timerAfterPlateAddBeforeAdvance: transition.timerAfterMs,
          firstRecordedEvaluationAfterEnableMs: firstEvaluation.timeMs,
          ticksToFirstRecordedEvaluation: ticksToFirstEvaluation,
          nominalNoResetOpportunityMs: nominalOpportunityMs,
          projectedCompactionAtEarliestMaturity: projectedCompactionAtMaturity,
          projectedCompactionAtGapEnd: projectedCompactionAtEnd,
          laterGapPlateCount: laterPlates.length,
          laterGapPlateCoverageByCell: laterPlates.length === 0 ? 'none-born-after-enable' : 'unknown-mask-not-retained',
          noduleBirthRecordedAtCell: false,
          maxNodulesReachedAtAnySavedBoundary: maxCountBlocked,
          cellwiseTimerTimelineRetained: false,
          cellwiseNearbyNoduleResultRetained: false,
          primaryClassification,
          primaryReason,
          classificationBasis
        };
        records.push(record);
        cells.push(record);
      }

      armCells[armName] = records;
    }

    const naturalCells = new Set(armCells.natural.map((row) => row.cell));
    const timerClearCells = new Set(armCells.timerClear.map((row) => row.cell));
    if (naturalCells.size !== timerClearCells.size
      || [...naturalCells].some((cell) => !timerClearCells.has(cell))) {
      throw new Error(`Paired qualification transition sets differ for seed ${seedRecord.seed}`);
    }
    perSeed.push({ seed: seedRecord.seed, arms: armCells });
  }

  const categories = ['RIGHT-CENSORED', 'PLATE-RESET CENSORED', 'QUALIFICATION LOST',
    'NEARBY-NODULE BLOCKED', 'MAX-COUNT BLOCKED', 'OTHER EXPLAINED', 'DATA INSUFFICIENT'];
  const summaries = Object.fromEntries(['natural', 'timerClear'].map((arm) => {
    const rows = cells.filter((row) => row.arm === arm);
    const opportunities = rows.map((row) => row.nominalNoResetOpportunityMs / 1000).sort((a, b) => a - b);
    return [arm, {
      cellCount: rows.length,
      classificationCounts: Object.fromEntries(categories.map((category) => [category,
        rows.filter((row) => row.primaryClassification === category).length])),
      nominalNoResetOpportunityUnder30Seconds: opportunities.filter((seconds) => seconds < 30).length,
      nominalNoResetOpportunityAtLeast30Seconds: opportunities.filter((seconds) => seconds >= 30).length,
      dataInsufficientWithNominalOpportunityUnder30Seconds: rows.filter((row) =>
        row.primaryClassification === 'DATA INSUFFICIENT'
          && row.nominalNoResetOpportunityMs < PERSISTENCE_MS).length,
      dataInsufficientWithNominalOpportunityAtLeast30Seconds: rows.filter((row) =>
        row.primaryClassification === 'DATA INSUFFICIENT'
          && row.nominalNoResetOpportunityMs >= PERSISTENCE_MS).length,
      projectedCompactionBelowThresholdAtEarliestMaturity: rows.filter((row) =>
        row.projectedCompactionAtEarliestMaturity < COMPACTION_THRESHOLD).length,
      projectedCompactionBelowThresholdByGapEnd: rows.filter((row) =>
        row.projectedCompactionAtGapEnd < COMPACTION_THRESHOLD).length,
      maxCountBlockedAtAnySavedBoundary: rows.some((row) => row.maxNodulesReachedAtAnySavedBoundary),
      nominalOpportunitySeconds: {
        min: opportunities[0],
        median: (opportunities[15] + opportunities[16]) / 2,
        max: opportunities.at(-1)
      }
    }];
  }));
  const perSeedSummaries = perSeed.map(({ seed }) => ({
    seed,
    arms: Object.fromEntries(['natural', 'timerClear'].map((arm) => {
      const rows = cells.filter((row) => row.seed === seed && row.arm === arm);
      return [arm, {
        cellCount: rows.length,
        classificationCounts: Object.fromEntries(categories.map((category) => [category,
          rows.filter((row) => row.primaryClassification === category).length])),
        nominalNoResetOpportunityUnder30Seconds: rows.filter((row) =>
          row.nominalNoResetOpportunityMs < PERSISTENCE_MS).length,
        nominalNoResetOpportunityAtLeast30Seconds: rows.filter((row) =>
          row.nominalNoResetOpportunityMs >= PERSISTENCE_MS).length,
        dataInsufficientWithNominalOpportunityUnder30Seconds: rows.filter((row) =>
          row.primaryClassification === 'DATA INSUFFICIENT'
            && row.nominalNoResetOpportunityMs < PERSISTENCE_MS).length,
        dataInsufficientWithNominalOpportunityAtLeast30Seconds: rows.filter((row) =>
          row.primaryClassification === 'DATA INSUFFICIENT'
            && row.nominalNoResetOpportunityMs >= PERSISTENCE_MS).length
      }];
    }))
  }));

  const pairedClassificationDifferences = [];
  for (const seed of perSeed) {
    const timerClearByCell = new Map(seed.arms.timerClear.map((row) => [row.cell, row]));
    for (const natural of seed.arms.natural) {
      const timerClear = timerClearByCell.get(natural.cell);
      if (natural.primaryClassification !== timerClear.primaryClassification) {
        pairedClassificationDifferences.push({
          seed: seed.seed,
          cell: natural.cell,
          natural: natural.primaryClassification,
          timerClear: timerClear.primaryClassification
        });
      }
    }
  }

  return {
    sourceEvidence: {
      experimentCommit: 'd6420667c23fb60c1779344c6ea7077c67147272',
      experimentBaselineCommit: 'e21d68597808f8b0c64ff360d0382d6b96971921',
      path: 'docs/ant/evidence/2026-10-13-nodule-zero-gap-lineage/data',
      inputMode: 'committed JSON only; no simulation, replay, or intervention executed'
    },
    semantics: {
      requirementMs: PERSISTENCE_MS,
      evaluationCadenceMs: 1000,
      hz: SIMULATION_HZ,
      observationBoundaryMs: 460000,
      lastSavedEvaluationMs,
      surfaceHalfLifeSeconds: SURFACE_HALF_LIFE_SECONDS,
      projection: 'scalar Float32 recurrence of SurfaceField.relax() from the saved grid-cell sample at 60 Hz with no contacts; derived, not a saved per-cell compaction/gate event'
    },
    limitations: [
      'The raw export stores per-cell timer, qualification, and proximity timelines only for Nodule birth cells; none of the 32 target cells is a birth cell.',
      'Plate masks and source descriptors were stripped from the Nodule export and are absent from the separate committed TrailPlate gap-lineage export; per-cell later-Plate coverage and timer resets cannot be reconstructed.',
      'The saved one-second evaluation rows are aggregate counts without cell IDs or blocker causes.',
      'No per-cell Nodule proximity result or gap-entry Nodule positions are retained for nonbirth target cells.',
      'Compaction projections follow the 1800 s no-contact half-life law; they are derived estimates rather than recorded per-cell Float32 samples.'
    ],
    summaries,
    perSeedSummaries,
    pairedClassificationDifferences,
    cells
  };
}

function relaxFloat32(compaction, ticks) {
  let value = Math.fround(compaction);
  const multiplier = Math.exp(-Math.LN2 * (1 / SIMULATION_HZ) / SURFACE_HALF_LIFE_SECONDS);
  for (let tick = 0; tick < ticks; tick += 1) value = Math.fround(value * multiplier);
  return value;
}

function readEvidence() {
  return [20261005, 20261006, 20261007].map((seed) => JSON.parse(fs.readFileSync(
    path.join(SOURCE_DATA_DIR, `seed-${seed}.json`), 'utf8')));
}

const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const outputPath = path.resolve(process.argv[outputIndex + 1]);
  fs.writeFileSync(outputPath, `${JSON.stringify(auditNoduleCensoring(readEvidence()), null, 2)}\n`, 'utf8');
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(auditNoduleCensoring(readEvidence()), null, 2)}\n`);
}
