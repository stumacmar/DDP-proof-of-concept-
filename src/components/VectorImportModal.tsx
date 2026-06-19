import { useState } from 'react';
import { Modal } from './PlotEditor';
import { extractFromPdf } from '../vectorPdfExtract';
import {
  classifyPdfContent, findPlotCandidates, mapLegendTerms,
  type ContentClassification, type LegendMatch, type PlotCandidate,
} from '../vectorPdf';

export interface VectorImportResult {
  pageImageDataUrl: string;
  plots: PlotCandidate[];
  legend: LegendMatch[];
}

interface Props {
  onApply: (result: VectorImportResult) => void;
  onClose: () => void;
}

interface Parsed {
  classification: ContentClassification;
  candidates: PlotCandidate[];
  rejected: number;
  legend: LegendMatch[];
  pageImageDataUrl: string;
  pageCount: number;
}

export default function VectorImportModal({ onApply, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const ex = await extractFromPdf(file, 1);
      const classification = classifyPdfContent(ex.stats);
      const { candidates, rejected } = findPlotCandidates(ex.tokens);
      const legend = mapLegendTerms(ex.tokens);
      setParsed({
        classification, candidates, rejected, legend,
        pageImageDataUrl: ex.pageImageDataUrl, pageCount: ex.pageCount,
      });
      setSelected(new Set(candidates.map((c) => c.number)));
    } catch {
      setError('Could not read this PDF. Make sure it is a PDF file exported from CAD.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (n: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  const apply = () => {
    if (!parsed) return;
    onApply({
      pageImageDataUrl: parsed.pageImageDataUrl,
      plots: parsed.candidates.filter((c) => selected.has(c.number)),
      legend: parsed.legend,
    });
  };

  return (
    <Modal title="Import from vector PDF (beta)" onClose={onClose}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!parsed && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Reads a <strong>native CAD-exported</strong> PDF and proposes plot markers and legend
            terms for you to confirm. It works best on vector PDFs — scans/photos are unreliable.
            Nothing is added until you press Apply.
          </p>
          <label className="block">
            <span className="inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white active:bg-blue-700">
              {busy ? 'Reading…' : 'Choose PDF file'}
              <input type="file" accept=".pdf,application/pdf" className="sr-only" disabled={busy}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </span>
          </label>
        </div>
      )}

      {parsed && (
        <div className="space-y-3 text-sm">
          <Verdict c={parsed.classification} pageCount={parsed.pageCount} />

          <div className="rounded-lg border border-slate-200 p-2">
            <p className="font-semibold text-slate-700">
              {parsed.candidates.length} plot-number candidate{parsed.candidates.length === 1 ? '' : 's'} found
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Drawings also contain dimensions and levels, so review these. {selected.size} selected.
              {parsed.rejected > 0 && ` ${parsed.rejected} out-of-range numbers ignored.`}
            </p>
            {parsed.candidates.length > 0 && (
              <>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setSelected(new Set(parsed.candidates.map((c) => c.number)))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">All</button>
                  <button type="button" onClick={() => setSelected(new Set())}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">None</button>
                </div>
                <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {parsed.candidates.map((c) => (
                    <button key={c.number} type="button" onClick={() => toggle(c.number)}
                      className={`min-h-tap rounded-lg border px-3 py-1 text-sm font-semibold ${
                        selected.has(c.number) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-400'
                      }`}>
                      {c.number}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-2">
            <p className="font-semibold text-slate-700">
              {parsed.legend.length} legend term{parsed.legend.length === 1 ? '' : 's'} recognised
            </p>
            {parsed.legend.length === 0 ? (
              <p className="mt-0.5 text-xs text-slate-500">No services/stage terms matched on this page.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {parsed.legend.map((m, i) => (
                  <li key={i}>“{m.term}” → <strong>{m.label}</strong> <span className="text-slate-400">({m.category.replace('_', ' ')})</span></li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Legend matches are informational in this beta (a per-developer profile that remembers
              them is the next step).
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={apply}
              className="flex-1 min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700">
              Apply: add {selected.size} plot{selected.size === 1 ? '' : 's'} &amp; use page
            </button>
            <button type="button" onClick={onClose}
              className="min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700 active:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Verdict({ c, pageCount }: { c: ContentClassification; pageCount: number }) {
  const tone =
    c.kind === 'vector' ? 'bg-emerald-50 text-emerald-800'
    : c.kind === 'mixed' ? 'bg-amber-50 text-amber-900'
    : 'bg-orange-50 text-orange-900';
  const heading =
    c.kind === 'vector' ? 'Vector PDF detected — good source'
    : c.kind === 'raster' ? 'Looks scanned/flattened — results will be unreliable'
    : c.kind === 'mixed' ? 'Mixed content — review carefully'
    : 'No usable content detected';
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <p className="font-semibold">{heading}</p>
      {c.reasons.map((r, i) => <p key={i} className="mt-0.5 text-xs">{r}</p>)}
      {pageCount > 1 && <p className="mt-0.5 text-xs">Reading page 1 of {pageCount}.</p>}
    </div>
  );
}
