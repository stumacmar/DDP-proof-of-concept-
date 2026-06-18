import { describe, it, expect } from 'vitest';
import {
  detectColumns, normaliseBuildStage, buildImportPreview, type CsvRow, type ColumnMapping,
} from './csv';
import type { Plot } from './types';

const W1 = '2026-01-05';

function plot(number: string): Plot {
  return { id: `p${number}`, number, xPct: 0, yPct: 0, stage: 'foundations', completionWeek: null, phaseId: 'ph1' };
}

describe('detectColumns', () => {
  it('detects the fixed-format headers, order-independent and case-insensitive', () => {
    const m = detectColumns(['Build Stage', 'PLOT_NO', 'completion_week', 'phase']);
    expect(m).not.toBeNull();
    expect(m!.plot_no).toBe('PLOT_NO');
    expect(m!.build_stage).toBe('Build Stage');
    expect(m!.completion).toBe('completion_week');
    expect(m!.completionIsDate).toBe(false);
  });

  it('detects a completion_date column as a date', () => {
    const m = detectColumns(['plot_no', 'build_stage', 'completion_date']);
    expect(m!.completion).toBe('completion_date');
    expect(m!.completionIsDate).toBe(true);
  });

  it('returns null when required columns are missing', () => {
    expect(detectColumns(['plot', 'something'])).toBeNull();
  });
});

describe('normaliseBuildStage synonyms', () => {
  it.each([
    ['Super', 'superstructure'],
    ['Roof', 'watertight'],
    ['Wind & watertight', 'watertight'],
    ['FF', 'firstfix'],
    ['PC', 'complete'],
    ['Practical Completion', 'complete'],
    ['Foundations', 'foundations'],
  ])('maps "%s" -> %s', (raw, expected) => {
    expect(normaliseBuildStage(raw)).toBe(expected);
  });

  it('returns null for unknown stages', () => {
    expect(normaliseBuildStage('Topping out')).toBeNull();
  });
});

const mapping: ColumnMapping = {
  plot_no: 'plot_no', build_stage: 'build_stage', completion: 'completion_week',
  completionIsDate: false, phase: null,
};

describe('buildImportPreview categorisation', () => {
  const plots = [plot('1'), plot('2'), plot('3')];

  it('matches existing plots and lists unmatched / missing', () => {
    const rows: CsvRow[] = [
      { plot_no: '1', build_stage: 'Super', completion_week: '20' },
      { plot_no: '2', build_stage: 'PC', completion_week: '30' },
      { plot_no: '9', build_stage: 'PC', completion_week: '30' }, // no such plot
    ];
    const p = buildImportPreview(rows, plots, mapping, W1);
    expect(p.updates).toHaveLength(2);
    expect(p.unmatchedCsvPlotNos).toEqual(['9']);
    expect(p.plotsNotInCsv).toEqual(['3']);
    expect(p.updates.find((u) => u.plotNumber === '1')!.stage).toBe('superstructure');
  });

  it('flags unrecognised build stage rows and skips them', () => {
    const rows: CsvRow[] = [{ plot_no: '1', build_stage: 'Topping out', completion_week: '10' }];
    const p = buildImportPreview(rows, plots, mapping, W1);
    expect(p.updates).toHaveLength(0);
    expect(p.badStageRows).toEqual([{ plotNo: '1', rawStage: 'Topping out' }]);
  });

  it('last row wins for duplicate plot numbers and flags them', () => {
    const rows: CsvRow[] = [
      { plot_no: '1', build_stage: 'Foundations', completion_week: '10' },
      { plot_no: '1', build_stage: 'Complete', completion_week: '40' },
    ];
    const p = buildImportPreview(rows, plots, mapping, W1);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].stage).toBe('complete');
    expect(p.updates[0].completionWeek).toBe(40);
    expect(p.duplicatePlotNos).toEqual(['1']);
  });

  it('empty completion leaves completion unchanged (null)', () => {
    const rows: CsvRow[] = [{ plot_no: '1', build_stage: 'Super', completion_week: '' }];
    const p = buildImportPreview(rows, plots, mapping, W1);
    expect(p.updates[0].completionWeek).toBeNull();
  });

  it('converts completion dates to the nearest programme week', () => {
    const dateMapping: ColumnMapping = { ...mapping, completion: 'completion_date', completionIsDate: true };
    const rows: CsvRow[] = [{ plot_no: '1', build_stage: 'PC', completion_date: '12/01/2026' }];
    const p = buildImportPreview(rows, plots, dateMapping, W1);
    expect(p.updates[0].completionWeek).toBe(2); // 12 Jan = week 2
  });

  it('records unparseable dates per-row without failing the import', () => {
    const dateMapping: ColumnMapping = { ...mapping, completion: 'completion_date', completionIsDate: true };
    const rows: CsvRow[] = [{ plot_no: '1', build_stage: 'PC', completion_date: 'soon' }];
    const p = buildImportPreview(rows, plots, dateMapping, W1);
    expect(p.updates).toHaveLength(1); // stage still applied
    expect(p.updates[0].completionWeek).toBeNull();
    expect(p.badDateRows).toEqual([{ plotNo: '1', rawDate: 'soon' }]);
  });
});
