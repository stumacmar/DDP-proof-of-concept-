/**
 * Vector-PDF extraction — PURE, testable logic (no pdf.js, no DOM).
 *
 * This is the "read the key at the start, correctly" discipline applied to a
 * native CAD-exported PDF: detect per-file whether the page is genuinely
 * vector, then PROPOSE plot-marker positions and legend→vocabulary mappings
 * for the engineer to confirm. It never auto-commits anything.
 *
 * The pdf.js-dependent parsing lives in vectorPdfExtract.ts so this module
 * stays unit-testable in Node.
 */
import { BUILD_STAGES, SERVICES, ROAD_STAGES } from './config';
import { normaliseBuildStage } from './csv';

export interface TextToken {
  text: string;
  /** Position as a percentage of the page (0–100), top-left origin. */
  xPct: number;
  yPct: number;
  /** Approx glyph height in device px — used only for light filtering. */
  height: number;
}

export interface PageContentStats {
  textItemCount: number;
  pathOpCount: number;
  imageOpCount: number;
  /** 0–1 estimate of how much of the page a single raster image covers. */
  imageCoverage: number;
}

export type ContentKind = 'vector' | 'raster' | 'mixed' | 'empty';

export interface ContentClassification {
  kind: ContentKind;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

/**
 * Classify a page as vector / raster / mixed from cheap content statistics.
 * The dominant signal is "is there real selectable text?" — a scanned sheet
 * has ~none, a CAD export has lots.
 */
export function classifyPdfContent(s: PageContentStats): ContentClassification {
  const reasons: string[] = [];
  const hasText = s.textItemCount >= 10;
  const hasVectorGeometry = s.pathOpCount >= 20;
  const bigRaster = s.imageOpCount >= 1 && s.imageCoverage >= 0.6;

  if (!hasText && !hasVectorGeometry && !bigRaster) {
    return { kind: 'empty', confidence: 'low', reasons: ['No text, vector paths or large image found on this page.'] };
  }
  if (bigRaster && !hasText) {
    reasons.push(`Page is dominated by a raster image (~${Math.round(s.imageCoverage * 100)}% coverage) with only ${s.textItemCount} text items — looks scanned/flattened.`);
    return { kind: 'raster', confidence: 'high', reasons };
  }
  if (hasText && hasVectorGeometry && !bigRaster) {
    reasons.push(`${s.textItemCount} live text items and ${s.pathOpCount} vector path operations — native CAD/vector export.`);
    return { kind: 'vector', confidence: 'high', reasons };
  }
  if (hasText && bigRaster) {
    reasons.push('Live text present, but a large raster image also covers the page (possible scanned sheet with a text layer).');
    return { kind: 'mixed', confidence: 'medium', reasons };
  }
  reasons.push(`${s.textItemCount} text items, ${s.pathOpCount} path ops, ${s.imageOpCount} images — partial signals only.`);
  return { kind: hasText ? 'vector' : 'raster', confidence: 'low', reasons };
}

// ── plot-number candidate detection ────────────────────────────────────────
export interface PlotCandidate {
  number: string;
  xPct: number;
  yPct: number;
}

export interface PlotCandidateResult {
  candidates: PlotCandidate[];
  /** Numeric tokens rejected as out-of-range/implausible. */
  rejected: number;
}

/**
 * Find plausible plot-number labels among text tokens. Deliberately strict
 * (1–3 digits, optional single-letter suffix, within a sane range) — but
 * drawings carry many numeric tokens (dimensions, levels, gradients), so these
 * are CANDIDATES the engineer confirms, not auto-placed markers.
 */
export function findPlotCandidates(
  tokens: TextToken[],
  opts?: { maxPlot?: number },
): PlotCandidateResult {
  const maxPlot = opts?.maxPlot ?? 400;
  const seen = new Map<string, PlotCandidate>();
  let rejected = 0;

  for (const t of tokens) {
    const raw = t.text.trim();
    if (!/^\d{1,3}[A-Za-z]?$/.test(raw)) continue; // no decimals, ≤3 digits
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > maxPlot) {
      rejected++;
      continue;
    }
    if (!seen.has(raw)) seen.set(raw, { number: raw, xPct: t.xPct, yPct: t.yPct });
  }

  return { candidates: [...seen.values()], rejected };
}

// ── legend → vocabulary mapping ────────────────────────────────────────────
export type LegendCategory = 'build_stage' | 'service' | 'road_stage';

export interface LegendMatch {
  /** The text as written on the sheet. */
  term: string;
  /** The vocabulary id it maps to. */
  mapsTo: string;
  category: LegendCategory;
  /** Human label of the vocabulary item. */
  label: string;
  xPct: number;
  yPct: number;
}

/** Service synonyms — the developer-agnostic part: read what's on the key. */
const SERVICE_SYNONYMS: Record<string, string> = {
  foul: 'foul', 'foul drainage': 'foul', 'foul water': 'foul', 'foul sewer': 'foul', fw: 'foul',
  'surface water': 'surface', 'surface water drainage': 'surface', storm: 'surface', 'storm water': 'surface', sw: 'surface',
  potable: 'potable', 'potable water': 'potable', water: 'potable', 'mains water': 'potable', 'water main': 'potable',
  gas: 'gas', 'gas main': 'gas',
  electric: 'electric', electricity: 'electric', lv: 'electric', hv: 'electric', power: 'electric', 'electricity supply': 'electric',
  'street lighting': 'streetlighting', 'street light': 'streetlighting', 'street lights': 'streetlighting', lighting: 'streetlighting', 'lighting column': 'streetlighting',
  comms: 'comms', fibre: 'comms', fiber: 'comms', telecoms: 'comms', bt: 'comms', openreach: 'comms', 'comms/fibre': 'comms',
  road: 'road', carriageway: 'road', highway: 'road', 'road construction': 'road',
};

/**
 * Recognise legend terms on the sheet and map them to the app's fixed
 * vocabulary (build stages / services / road stages). Token-level matching —
 * vector PDFs usually emit a legend label as a single text run.
 */
export function mapLegendTerms(tokens: TextToken[]): LegendMatch[] {
  const out: LegendMatch[] = [];
  const pushed = new Set<string>();

  for (const t of tokens) {
    const raw = t.text.trim();
    const key = raw.toLowerCase();
    if (!key) continue;

    const stage = normaliseBuildStage(raw);
    if (stage && !pushed.has(`bs:${stage}`)) {
      out.push({ term: raw, mapsTo: stage, category: 'build_stage', label: labelFor(BUILD_STAGES, stage), xPct: t.xPct, yPct: t.yPct });
      pushed.add(`bs:${stage}`);
      continue;
    }

    const svc = SERVICE_SYNONYMS[key];
    if (svc && !pushed.has(`sv:${svc}`)) {
      out.push({ term: raw, mapsTo: svc, category: 'service', label: labelFor(SERVICES, svc), xPct: t.xPct, yPct: t.yPct });
      pushed.add(`sv:${svc}`);
      continue;
    }

    const road = ROAD_STAGES.find((r) => r.id === key || r.label.toLowerCase() === key);
    if (road && !pushed.has(`rd:${road.id}`)) {
      out.push({ term: raw, mapsTo: road.id, category: 'road_stage', label: road.label, xPct: t.xPct, yPct: t.yPct });
      pushed.add(`rd:${road.id}`);
    }
  }

  return out;
}

function labelFor(list: readonly { id: string; label: string }[], id: string): string {
  return list.find((x) => x.id === id)?.label ?? id;
}

/** Normalise a device-space point to a top-left-origin percentage. */
export function toPct(
  xDev: number, yDev: number, widthDev: number, heightDev: number,
): { xPct: number; yPct: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { xPct: clamp(xDev / widthDev) * 100, yPct: clamp(yDev / heightDev) * 100 };
}
