import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  buildImportPreview, detectColumns, type ColumnMapping, type CsvRow, type ImportPreview,
} from '../csv';
import { saveCsvMapping, loadCsvMapping, triggerDownload, safeName } from '../persistence';
import { Modal } from './PlotEditor';
import type { Plot } from '../types';

interface Props {
  plots: Plot[];
  week1Date: string;
  siteName: string;
  onApply: (preview: ImportPreview) => void;
  onClose: () => void;
}

type Step = 'pick' | 'map' | 'preview';

interface SavedMapping { plot_no: string | null; build_stage: string | null; completion: string | null; completionIsDate: boolean; phase: string | null }

export default function CsvImportModal({ plots, week1Date, siteName, onApply, onClose }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo<ImportPreview | null>(() => {
    if (!mapping || step !== 'preview') return null;
    return buildImportPreview(rows, plots, mapping, week1Date);
  }, [mapping, rows, plots, week1Date, step]);

  const handleFile = (file: File) => {
    setError(null);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hdrs = (res.meta.fields ?? []).filter(Boolean);
        if (hdrs.length === 0) { setError('No columns found in this CSV.'); return; }
        setHeaders(hdrs);
        setRows(res.data as CsvRow[]);

        const detected = detectColumns(hdrs);
        if (detected) {
          setMapping(detected);
          setStep('preview');
        } else {
          // Reject only if there is genuinely nothing usable; otherwise map.
          const saved = loadCsvMapping<SavedMapping>();
          setMapping(restoreMapping(saved, hdrs));
          setStep('map');
        }
      },
      error: () => setError('Could not read this CSV file.'),
    });
  };

  const confirmMapping = () => {
    if (!mapping?.plot_no || !mapping?.build_stage) {
      setError('Please choose which columns are the plot number and the build stage.');
      return;
    }
    setError(null);
    saveCsvMapping({
      plot_no: mapping.plot_no, build_stage: mapping.build_stage,
      completion: mapping.completion, completionIsDate: mapping.completionIsDate, phase: mapping.phase,
    });
    setStep('preview');
  };

  const downloadTemplate = () => {
    const header = 'plot_no,build_stage,completion_week,phase';
    const lines = plots.map((p) => `${p.number},,,`);
    const csv = [header, ...lines].join('\n');
    triggerDownload(new Blob([csv], { type: 'text/csv' }), `${safeName(siteName)}-build-programme-template.csv`);
  };

  return (
    <Modal title="Import build programme (CSV)" onClose={onClose}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === 'pick' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Updates build stage &amp; completion week for plots already placed on the plan, matched by
            plot number. It never creates or moves markers.
          </p>
          <label className="block">
            <span className="inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white active:bg-blue-700">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </span>
          </label>
          <button type="button" onClick={downloadTemplate}
            className="text-sm font-semibold text-blue-700 underline">
            Download CSV template (with current plot numbers)
          </button>
        </div>
      )}

      {step === 'map' && mapping && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            We couldn't recognise the columns. Tell us which is which:
          </p>
          {([
            ['plot_no', 'Plot number (required)'],
            ['build_stage', 'Build stage (required)'],
            ['completion', 'Completion week / date'],
            ['phase', 'Phase (optional)'],
          ] as const).map(([role, label]) => (
            <label key={role} className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">{label}</span>
              <select
                value={(mapping[role as keyof ColumnMapping] as string) ?? ''}
                onChange={(e) => setMapping({ ...mapping, [role]: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">—</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mapping.completionIsDate}
              onChange={(e) => setMapping({ ...mapping, completionIsDate: e.target.checked })} />
            Completion column holds a calendar date (not a week number)
          </label>
          <button type="button" onClick={confirmMapping}
            className="w-full min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700">
            Continue to preview
          </button>
        </div>
      )}

      {step === 'preview' && preview && (
        <PreviewPanel preview={preview} onApply={() => onApply(preview)} onCancel={onClose} />
      )}
    </Modal>
  );
}

function PreviewPanel({ preview, onApply, onCancel }: { preview: ImportPreview; onApply: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
        {preview.updates.length} plots matched and will update
      </p>

      {preview.duplicatePlotNos.length > 0 && (
        <Note tone="amber" title="Duplicate plot numbers in CSV (last row wins)">
          {preview.duplicatePlotNos.join(', ')}
        </Note>
      )}
      {preview.unmatchedCsvPlotNos.length > 0 && (
        <Note tone="amber" title={`${preview.unmatchedCsvPlotNos.length} CSV rows with no matching plot on the plan`}>
          {preview.unmatchedCsvPlotNos.join(', ')}
        </Note>
      )}
      {preview.badStageRows.length > 0 && (
        <Note tone="red" title={`${preview.badStageRows.length} rows skipped — unrecognised build stage`}>
          {preview.badStageRows.map((r) => `Plot ${r.plotNo} ("${r.rawStage}")`).join(', ')}
        </Note>
      )}
      {preview.badDateRows.length > 0 && (
        <Note tone="red" title={`${preview.badDateRows.length} rows with unparseable completion (stage still applied)`}>
          {preview.badDateRows.map((r) => `Plot ${r.plotNo} ("${r.rawDate}")`).join(', ')}
        </Note>
      )}
      {preview.plotsNotInCsv.length > 0 && (
        <Note tone="slate" title={`${preview.plotsNotInCsv.length} plots on the plan not in this CSV (unchanged)`}>
          {preview.plotsNotInCsv.join(', ')}
        </Note>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onApply} disabled={preview.updates.length === 0}
          className="flex-1 min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-40">
          Apply {preview.updates.length} updates
        </button>
        <button type="button" onClick={onCancel}
          className="min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700 active:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Note({ tone, title, children }: { tone: 'amber' | 'red' | 'slate'; title: string; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-900',
    red: 'bg-red-50 text-red-800',
    slate: 'bg-slate-100 text-slate-600',
  } as const;
  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 break-words text-xs">{children}</p>
    </div>
  );
}

function restoreMapping(saved: SavedMapping | null, headers: string[]): ColumnMapping {
  const pick = (v: string | null) => (v && headers.includes(v) ? v : null);
  return {
    plot_no: pick(saved?.plot_no ?? null),
    build_stage: pick(saved?.build_stage ?? null),
    completion: pick(saved?.completion ?? null),
    completionIsDate: saved?.completionIsDate ?? false,
    phase: pick(saved?.phase ?? null),
  };
}
