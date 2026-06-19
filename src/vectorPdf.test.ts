import { describe, it, expect } from 'vitest';
import {
  classifyPdfContent, findPlotCandidates, mapLegendTerms, toPct,
  type TextToken,
} from './vectorPdf';

const tok = (text: string, xPct = 50, yPct = 50, height = 10): TextToken => ({ text, xPct, yPct, height });

describe('classifyPdfContent', () => {
  it('classifies a text-rich, path-rich page as vector', () => {
    const c = classifyPdfContent({ textItemCount: 200, pathOpCount: 5000, imageOpCount: 0, imageCoverage: 0 });
    expect(c.kind).toBe('vector');
    expect(c.confidence).toBe('high');
  });

  it('classifies a big image with no text as raster', () => {
    const c = classifyPdfContent({ textItemCount: 0, pathOpCount: 0, imageOpCount: 1, imageCoverage: 0.95 });
    expect(c.kind).toBe('raster');
    expect(c.confidence).toBe('high');
  });

  it('classifies text over a large image as mixed', () => {
    const c = classifyPdfContent({ textItemCount: 50, pathOpCount: 0, imageOpCount: 1, imageCoverage: 0.8 });
    expect(c.kind).toBe('mixed');
  });

  it('classifies a blank page as empty', () => {
    const c = classifyPdfContent({ textItemCount: 0, pathOpCount: 0, imageOpCount: 0, imageCoverage: 0 });
    expect(c.kind).toBe('empty');
  });
});

describe('findPlotCandidates', () => {
  it('accepts 1–3 digit labels with optional letter suffix and dedupes', () => {
    const { candidates } = findPlotCandidates([
      tok('1', 10, 10), tok('42', 20, 20), tok('128a', 30, 30), tok('42', 99, 99),
    ]);
    expect(candidates.map((c) => c.number)).toEqual(['1', '42', '128a']);
    // first occurrence wins for the duplicate
    expect(candidates.find((c) => c.number === '42')!.xPct).toBe(20);
  });

  it('rejects decimals, oversized numbers and non-numeric tokens', () => {
    const { candidates, rejected } = findPlotCandidates([
      tok('12.5'), tok('1500'), tok('FFL'), tok('1:200'), tok('850'),
    ], { maxPlot: 400 });
    expect(candidates).toHaveLength(0);
    // Only '850' passes the 1–3 digit shape then fails the range check; '1500'
    // is 4 digits so it never reaches the range test.
    expect(rejected).toBe(1);
  });

  it('respects a custom max plot number', () => {
    const { candidates } = findPlotCandidates([tok('300')], { maxPlot: 200 });
    expect(candidates).toHaveLength(0);
  });
});

describe('mapLegendTerms', () => {
  it('maps build-stage, service and road-stage legend terms to the vocabulary', () => {
    const matches = mapLegendTerms([
      tok('Foul Drainage'), tok('SW'), tok('Super'), tok('Binder'), tok('Openreach'),
    ]);
    const byCat = (cat: string) => matches.filter((m) => m.category === cat).map((m) => m.mapsTo);
    expect(byCat('service')).toEqual(expect.arrayContaining(['foul', 'surface', 'comms']));
    expect(byCat('build_stage')).toContain('superstructure');
    expect(byCat('road_stage')).toContain('binder');
  });

  it('dedupes repeated legend terms', () => {
    const matches = mapLegendTerms([tok('Gas'), tok('gas'), tok('GAS')]);
    expect(matches.filter((m) => m.mapsTo === 'gas')).toHaveLength(1);
  });

  it('ignores unrecognised terms', () => {
    expect(mapLegendTerms([tok('North'), tok('Rev P03'), tok('Scale 1:500')])).toEqual([]);
  });
});

describe('toPct', () => {
  it('normalises device coordinates and clamps to the page', () => {
    expect(toPct(800, 600, 1600, 1200)).toEqual({ xPct: 50, yPct: 50 });
    expect(toPct(-10, 5000, 1600, 1200)).toEqual({ xPct: 0, yPct: 100 });
  });
});
