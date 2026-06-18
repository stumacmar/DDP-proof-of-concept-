import { dateToWeek, parseFlexibleDate } from './weeks';
import type { BuildStageId, Plot } from './types';

/**
 * CSV import for plot build stages / completion weeks.
 * Import updates EXISTING plots only — it never creates or moves markers.
 * Plot NUMBER is the join key.
 */

export type ColumnRole = 'plot_no' | 'build_stage' | 'completion' | 'phase';

export interface ColumnMapping {
  plot_no: string | null;
  build_stage: string | null;
  /** Header for completion week OR completion date (whichever is present). */
  completion: string | null;
  /** Whether the completion column holds a date (vs a week number). */
  completionIsDate: boolean;
  phase: string | null;
}

const HEADER_ALIASES: Record<ColumnRole | 'completion_date', string[]> = {
  plot_no: ['plot_no', 'plot', 'plot no', 'plot number', 'plotno', 'plot_number'],
  build_stage: ['build_stage', 'stage', 'build stage', 'buildstage'],
  completion: ['completion_week', 'completion week', 'comp_week', 'week'],
  completion_date: ['completion_date', 'completion date', 'comp_date', 'date'],
  phase: ['phase'],
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Detect the fixed-format columns from the CSV header row.
 * Returns null if plot_no or build_stage cannot be found (caller then shows
 * the manual mapping screen).
 */
export function detectColumns(headers: string[]): ColumnMapping | null {
  const find = (aliases: string[]): string | null => {
    for (const h of headers) {
      if (aliases.includes(norm(h))) return h;
    }
    return null;
  };

  const plot_no = find(HEADER_ALIASES.plot_no);
  const build_stage = find(HEADER_ALIASES.build_stage);
  if (!plot_no || !build_stage) return null;

  const completionWeekCol = find(HEADER_ALIASES.completion);
  const completionDateCol = find(HEADER_ALIASES.completion_date);

  return {
    plot_no,
    build_stage,
    completion: completionWeekCol ?? completionDateCol ?? null,
    completionIsDate: !completionWeekCol && !!completionDateCol,
    phase: find(HEADER_ALIASES.phase),
  };
}

const STAGE_SYNONYMS: Record<string, BuildStageId> = {
  foundations: 'foundations',
  foundation: 'foundations',
  super: 'superstructure',
  superstructure: 'superstructure',
  watertight: 'watertight',
  'wind & watertight': 'watertight',
  'wind and watertight': 'watertight',
  roof: 'watertight',
  'roof/watertight': 'watertight',
  ff: 'firstfix',
  'first fix': 'firstfix',
  firstfix: 'firstfix',
  complete: 'complete',
  completed: 'complete',
  pc: 'complete',
  'practical completion': 'complete',
};

/** Map a raw build-stage string (incl. synonyms) to a stage id, or null. */
export function normaliseBuildStage(raw: string): BuildStageId | null {
  return STAGE_SYNONYMS[norm(raw)] ?? null;
}

export interface PreviewRowUpdate {
  plotId: string;
  plotNumber: string;
  stage: BuildStageId;
  /** Resolved programme week, or null = leave completion unchanged. */
  completionWeek: number | null;
  phase?: string;
}

export interface ImportPreview {
  /** Rows that matched a plot and will be applied. */
  updates: PreviewRowUpdate[];
  /** plot_no values in the CSV with no matching marker on the plan. */
  unmatchedCsvPlotNos: string[];
  /** plot numbers on the plan absent from the CSV (left unchanged). */
  plotsNotInCsv: string[];
  /** Rows skipped because the build_stage was unrecognised. */
  badStageRows: { plotNo: string; rawStage: string }[];
  /** Rows where a date could not be parsed (stage still applied if valid). */
  badDateRows: { plotNo: string; rawDate: string }[];
  /** plot_no values appearing more than once (last row wins). */
  duplicatePlotNos: string[];
}

export type CsvRow = Record<string, string>;

/**
 * Build a preview of what an import will do, WITHOUT mutating anything.
 * `week1Date` is needed to convert completion dates to programme weeks.
 */
export function buildImportPreview(
  rows: CsvRow[],
  plots: Plot[],
  mapping: ColumnMapping,
  week1Date: string,
): ImportPreview {
  const plotByNumber = new Map<string, Plot>();
  for (const p of plots) plotByNumber.set(norm(p.number), p);

  const updates = new Map<string, PreviewRowUpdate>(); // keyed by plotId
  const seenCsvPlotNos = new Set<string>();
  const duplicatePlotNos = new Set<string>();
  const unmatchedCsvPlotNos: string[] = [];
  const badStageRows: { plotNo: string; rawStage: string }[] = [];
  const badDateRows: { plotNo: string; rawDate: string }[] = [];
  const matchedNumbers = new Set<string>();

  for (const row of rows) {
    const rawPlotNo = (row[mapping.plot_no!] ?? '').trim();
    if (!rawPlotNo) continue; // skip blank lines

    if (seenCsvPlotNos.has(norm(rawPlotNo))) {
      duplicatePlotNos.add(rawPlotNo);
    }
    seenCsvPlotNos.add(norm(rawPlotNo));

    const plot = plotByNumber.get(norm(rawPlotNo));
    if (!plot) {
      if (!unmatchedCsvPlotNos.includes(rawPlotNo)) unmatchedCsvPlotNos.push(rawPlotNo);
      continue;
    }
    matchedNumbers.add(norm(rawPlotNo));

    const rawStage = (row[mapping.build_stage!] ?? '').trim();
    const stage = normaliseBuildStage(rawStage);
    if (!stage) {
      badStageRows.push({ plotNo: rawPlotNo, rawStage });
      continue;
    }

    // Resolve completion week (optional).
    let completionWeek: number | null = null;
    if (mapping.completion) {
      const rawComp = (row[mapping.completion] ?? '').trim();
      if (rawComp) {
        if (mapping.completionIsDate) {
          const d = parseFlexibleDate(rawComp);
          if (d) {
            completionWeek = dateToWeek(week1Date, d);
          } else {
            badDateRows.push({ plotNo: rawPlotNo, rawDate: rawComp });
          }
        } else {
          const wk = parseInt(rawComp, 10);
          if (Number.isFinite(wk)) completionWeek = wk;
          else badDateRows.push({ plotNo: rawPlotNo, rawDate: rawComp });
        }
      }
    }

    const phase = mapping.phase ? (row[mapping.phase] ?? '').trim() || undefined : undefined;

    // Last row wins for duplicates.
    updates.set(plot.id, {
      plotId: plot.id,
      plotNumber: plot.number,
      stage,
      completionWeek,
      phase,
    });
  }

  const plotsNotInCsv = plots
    .filter((p) => !matchedNumbers.has(norm(p.number)))
    .map((p) => p.number);

  return {
    updates: [...updates.values()],
    unmatchedCsvPlotNos,
    plotsNotInCsv,
    badStageRows,
    badDateRows,
    duplicatePlotNos: [...duplicatePlotNos],
  };
}
