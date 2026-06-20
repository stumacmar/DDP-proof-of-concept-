import { useEffect, useMemo, useRef, useState } from 'react';
import SitePlan from './components/SitePlan';
import PlotEditor, { Field, Modal } from './components/PlotEditor';
import ServicesPanel from './components/ServicesPanel';
import CsvImportModal from './components/CsvImportModal';
import VectorImportModal, { type VectorImportResult } from './components/VectorImportModal';
import { emptyProject, makePhase, newId } from './defaults';
import {
  loadFromLocalStorage, saveToLocalStorage, downloadJson,
  readProjectFromJsonFile, readProjectFromPdf,
} from './persistence';
import { exportPdf } from './pdf';
import { occupationStatus } from './occupation';
import { formatWeekCommencing } from './weeks';
import type { ImportPreview } from './csv';
import type { BuildStageId, Phase, Plot, Project, ServiceRange } from './types';

export default function App() {
  const [project, setProject] = useState<Project>(() => loadFromLocalStorage() ?? emptyProject());
  const [week, setWeek] = useState(1);
  const [setupMode, setSetupMode] = useState(false);
  const [placeMode, setPlaceMode] = useState(false);
  const [editingPlot, setEditingPlot] = useState<Plot | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [showVectorImport, setShowVectorImport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importSnapshot, setImportSnapshot] = useState<Project | null>(null);

  const drawingRef = useRef<HTMLDivElement>(null);

  // Autosave on every change.
  useEffect(() => { saveToLocalStorage(project); }, [project]);

  // Keep week within range if maxWeek changes.
  useEffect(() => {
    if (week > project.settings.maxWeek) setWeek(project.settings.maxWeek);
  }, [project.settings.maxWeek, week]);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 3500); };

  const phaseById = useMemo(() => new Map(project.phases.map((p) => [p.id, p])), [project.phases]);
  const conflictCount = useMemo(
    () => project.plots.filter((p) => occupationStatus(p, phaseById.get(p.phaseId), week).status === 'conflict').length,
    [project.plots, phaseById, week],
  );

  // ── plot operations ──────────────────────────────────────────────────────
  const placePlot = (xPct: number, yPct: number) => {
    const nextNum = String(
      project.plots.reduce((m, p) => Math.max(m, parseInt(p.number, 10) || 0), 0) + 1,
    );
    const plot: Plot = {
      id: newId('plot'), number: nextNum, xPct, yPct,
      stage: 'foundations', completionWeek: null, phaseId: project.phases[0].id,
    };
    setProject((pr) => ({ ...pr, plots: [...pr.plots, plot] }));
  };

  const savePlot = (p: Plot) => {
    setProject((pr) => ({ ...pr, plots: pr.plots.map((x) => (x.id === p.id ? p : x)) }));
    setEditingPlot(null);
  };
  const deletePlot = (id: string) => {
    setProject((pr) => ({ ...pr, plots: pr.plots.filter((x) => x.id !== id) }));
    setEditingPlot(null);
  };
  const movePlot = (id: string, xPct: number, yPct: number) => {
    setProject((pr) => ({ ...pr, plots: pr.plots.map((x) => (x.id === id ? { ...x, xPct, yPct } : x)) }));
  };
  const quickDeletePlot = (id: string) => {
    const plot = project.plots.find((p) => p.id === id);
    if (window.confirm(`Delete plot ${plot?.number ?? ''}?`)) {
      setProject((pr) => ({ ...pr, plots: pr.plots.filter((x) => x.id !== id) }));
    }
  };
  const clearAllPlots = () => {
    if (project.plots.length && window.confirm(`Delete all ${project.plots.length} plots? This cannot be undone.`)) {
      setProject((pr) => ({ ...pr, plots: [] }));
    }
  };

  const updatePhaseServices = (phaseId: string, services: ServiceRange[]) => {
    setProject((pr) => ({
      ...pr, phases: pr.phases.map((ph) => (ph.id === phaseId ? { ...ph, services } : ph)),
    }));
  };

  // ── file operations ──────────────────────────────────────────────────────
  const onUploadPlan = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setProject((pr) => ({ ...pr, planImage: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const openFromPdf = async (file: File) => {
    try {
      const p = await readProjectFromPdf(file);
      setProject(p);
      setShowMenu(false);
      flash('Project restored from PDF.');
    } catch (e) {
      flash((e as Error).message);
    }
  };
  const openFromJson = async (file: File) => {
    try {
      setProject(await readProjectFromJsonFile(file));
      setShowMenu(false);
      flash('Project file imported.');
    } catch {
      flash('Could not read that project file.');
    }
  };

  const doExport = async () => {
    if (!project.planImage || !drawingRef.current) { flash('Upload a site plan first.'); return; }
    setExporting(true);
    try {
      await exportPdf(project, week, drawingRef.current);
      flash('PDF exported with embedded project data.');
    } catch {
      flash('PDF export failed.');
    } finally {
      setExporting(false);
    }
  };

  // ── CSV import apply / undo ──────────────────────────────────────────────
  const applyImport = (preview: ImportPreview) => {
    setImportSnapshot(project);
    setProject((pr) => ({
      ...pr,
      plots: pr.plots.map((plot) => {
        const u = preview.updates.find((x) => x.plotId === plot.id);
        if (!u) return plot;
        const matchedPhase = u.phase
          ? pr.phases.find((ph) => ph.name.toLowerCase() === u.phase!.toLowerCase())
          : undefined;
        return {
          ...plot,
          stage: u.stage as BuildStageId,
          completionWeek: u.completionWeek ?? plot.completionWeek,
          phaseId: matchedPhase?.id ?? plot.phaseId,
        };
      }),
    }));
    setShowCsv(false);
    flash(`${preview.updates.length} plots updated. You can undo this import.`);
  };
  const undoImport = () => {
    if (importSnapshot) { setProject(importSnapshot); setImportSnapshot(null); flash('Import undone.'); }
  };

  // ── vector-PDF import: use the page as plan image + add confirmed plots ──
  const applyVectorImport = (res: VectorImportResult) => {
    setImportSnapshot(project);
    setProject((pr) => {
      const existing = pr.plots.reduce((m, p) => Math.max(m, parseInt(p.number, 10) || 0), 0);
      let next = existing;
      const newPlots: Plot[] = res.plots.map((c) => {
        const num = c.number.trim() || String(++next);
        return {
          id: newId('plot'), number: num, xPct: c.xPct, yPct: c.yPct,
          stage: 'foundations', completionWeek: null, phaseId: pr.phases[0].id,
        };
      });
      return { ...pr, planImage: res.pageImageDataUrl, plots: [...pr.plots, ...newPlots] };
    });
    setShowVectorImport(false);
    flash(`Added ${res.plots.length} plots from PDF. You can undo this import.`);
  };

  const settings = project.settings;
  const setSettings = (patch: Partial<typeof settings>) =>
    setProject((pr) => ({ ...pr, settings: { ...pr.settings, ...patch } }));

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-800">
            {settings.siteName || 'Site Programme Viewer'}
          </h1>
          {conflictCount > 0 && (
            <p className="text-xs font-semibold text-orange-700">{conflictCount} conflict{conflictCount > 1 ? 's' : ''} at week {week}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Mode">
            <ToggleBtn active={!setupMode} onClick={() => { setSetupMode(false); setPlaceMode(false); }}>View</ToggleBtn>
            <ToggleBtn active={setupMode} onClick={() => setSetupMode(true)}>Setup</ToggleBtn>
          </div>
          <button type="button" onClick={() => setShowMenu(true)} aria-label="Project menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-slate-600 active:bg-slate-100">⋯</button>
        </div>
      </header>

      {/* Body (scrollable) */}
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white">
          <SitePlan
            planImage={project.planImage}
            plots={project.plots}
            phases={project.phases}
            week={week}
            setupMode={setupMode}
            placeMode={placeMode && setupMode}
            drawingRef={drawingRef}
            onPlaceAt={placePlot}
            onTapPlot={setEditingPlot}
            onMovePlot={movePlot}
            onDeletePlot={quickDeletePlot}
            onUpload={onUploadPlan}
          />
        </div>

        {setupMode && (
          <SetupTools
            project={project}
            week={week}
            placeMode={placeMode}
            onTogglePlace={() => setPlaceMode((v) => !v)}
            onOpenCsv={() => setShowCsv(true)}
            onOpenVectorImport={() => setShowVectorImport(true)}
            onClearPlots={clearAllPlots}
            onUploadPlan={onUploadPlan}
            onUpdateServices={updatePhaseServices}
            onAddPhase={() => setProject((pr) => ({ ...pr, phases: [...pr.phases, makePhase(`Phase ${pr.phases.length + 1}`)] }))}
            onRenamePhase={(id, name) => setProject((pr) => ({ ...pr, phases: pr.phases.map((ph) => ph.id === id ? { ...ph, name } : ph) }))}
            settings={settings}
            setSettings={setSettings}
            canUndo={!!importSnapshot}
            onUndoImport={undoImport}
          />
        )}

        {!setupMode && project.planImage && (
          <ConflictList project={project} week={week} onTap={setEditingPlot} />
        )}
      </main>

      {/* Bottom bar: slider + export always visible */}
      <footer className="border-t border-slate-200 bg-white px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-bold text-slate-800">Week {week}</span>
          <span className="text-xs text-slate-500">{formatWeekCommencing(settings.week1Date, week)}</span>
        </div>
        <input
          type="range" min={1} max={settings.maxWeek} value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          aria-label="Programme week" className="w-full"
        />
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={doExport} disabled={exporting}
            className="flex-1 min-h-tap rounded-xl bg-slate-800 px-4 py-3 text-base font-semibold text-white active:bg-slate-900 disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </footer>

      {/* Modals */}
      {editingPlot && (
        <PlotEditor
          plot={editingPlot} phases={project.phases} week={week} week1Date={settings.week1Date}
          setupMode={setupMode} onSave={savePlot} onDelete={deletePlot} onClose={() => setEditingPlot(null)}
        />
      )}
      {showCsv && (
        <CsvImportModal
          plots={project.plots} week1Date={settings.week1Date} siteName={settings.siteName}
          onApply={applyImport} onClose={() => setShowCsv(false)}
        />
      )}
      {showVectorImport && (
        <VectorImportModal onApply={applyVectorImport} onClose={() => setShowVectorImport(false)} />
      )}
      {showMenu && (
        <ProjectMenu
          project={project}
          onClose={() => setShowMenu(false)}
          onExportJson={() => { downloadJson(project); }}
          onImportJson={openFromJson}
          onOpenPdf={openFromPdf}
          onReset={() => { setProject(emptyProject()); setShowMenu(false); flash('Started a new project.'); }}
        />
      )}

      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
          <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`min-h-tap rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
      {children}
    </button>
  );
}

// ── Setup tools section ──────────────────────────────────────────────────
function SetupTools(props: {
  project: Project; week: number; placeMode: boolean;
  onTogglePlace: () => void; onOpenCsv: () => void; onOpenVectorImport: () => void; onClearPlots: () => void; onUploadPlan: (f: File) => void;
  onUpdateServices: (phaseId: string, s: ServiceRange[]) => void;
  onAddPhase: () => void; onRenamePhase: (id: string, name: string) => void;
  settings: Project['settings']; setSettings: (p: Partial<Project['settings']>) => void;
  canUndo: boolean; onUndoImport: () => void;
}) {
  const { project, week, placeMode } = props;
  return (
    <div className="space-y-4 p-3">
      <Section title="Plot tools">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={props.onTogglePlace}
            className={`min-h-tap rounded-xl px-4 py-3 text-sm font-semibold ${placeMode ? 'bg-blue-600 text-white' : 'border border-blue-600 text-blue-700'}`}>
            {placeMode ? 'Placing… tap the plan' : 'Place plots'}
          </button>
          <button type="button" onClick={props.onOpenCsv}
            className="min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
            Import build programme (CSV)
          </button>
          <button type="button" onClick={props.onOpenVectorImport}
            className="min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
            Import from vector PDF (beta)
          </button>
          {props.canUndo && (
            <button type="button" onClick={props.onUndoImport}
              className="min-h-tap rounded-xl border border-amber-400 px-4 py-3 text-sm font-semibold text-amber-700">
              Undo last import
            </button>
          )}
          <label className="inline-flex min-h-tap cursor-pointer items-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
            Replace plan image
            <input type="file" accept="image/*" className="sr-only"
              onChange={(e) => e.target.files?.[0] && props.onUploadPlan(e.target.files[0])} />
          </label>
          {project.plots.length > 0 && (
            <button type="button" onClick={props.onClearPlots}
              className="min-h-tap rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700">
              Clear all plots
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {project.plots.length} plots placed. In Setup: <strong>tap</strong> a marker to edit it,
          <strong> drag</strong> it to reposition, or tap the red <strong>×</strong> to delete.
        </p>
      </Section>

      <Section title="Project settings">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Site name">
            <input value={props.settings.siteName} onChange={(e) => props.setSettings({ siteName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" placeholder="e.g. Meadow View" />
          </Field>
          <Field label="Week 1 commencing">
            <input type="date" value={props.settings.week1Date} onChange={(e) => props.setSettings({ week1Date: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </Field>
          <Field label="Maximum programme week">
            <input type="number" min={4} max={520} value={props.settings.maxWeek}
              onChange={(e) => props.setSettings({ maxWeek: Math.max(4, Number(e.target.value) || 4) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </Field>
        </div>
      </Section>

      {project.phases.map((phase) => (
        <Section key={phase.id} title={`Services — ${phase.name}`}>
          <PhaseHeader phase={phase} onRename={(name) => props.onRenamePhase(phase.id, name)} />
          <ServicesPanel phase={phase} maxWeek={props.settings.maxWeek} selectedWeek={week}
            onChange={(s) => props.onUpdateServices(phase.id, s)} />
        </Section>
      ))}
      <button type="button" onClick={props.onAddPhase}
        className="min-h-tap w-full rounded-xl border border-dashed border-slate-400 px-4 py-3 text-sm font-semibold text-slate-600">
        + Add phase
      </button>
    </div>
  );
}

function PhaseHeader({ phase, onRename }: { phase: Phase; onRename: (n: string) => void }) {
  return (
    <input value={phase.name} onChange={(e) => onRename(e.target.value)}
      aria-label="Phase name"
      className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function ConflictList({ project, week, onTap }: { project: Project; week: number; onTap: (p: Plot) => void }) {
  const phaseById = new Map(project.phases.map((p) => [p.id, p]));
  const conflicts = project.plots
    .map((plot) => ({ plot, res: occupationStatus(plot, phaseById.get(plot.phaseId), week) }))
    .filter((r) => r.res.status === 'conflict');
  if (conflicts.length === 0) return null;
  return (
    <div className="p-3">
      <Section title={`Conflicts at week ${week}`}>
        <ul className="space-y-2">
          {conflicts.map(({ plot, res }) => (
            <li key={plot.id}>
              <button type="button" onClick={() => onTap(plot)}
                className="w-full rounded-lg bg-orange-50 px-3 py-2 text-left">
                <span className="font-bold text-orange-900">Plot {plot.number}</span>
                <ul className="ml-4 list-disc text-sm text-orange-800">
                  {res.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ProjectMenu(props: {
  project: Project; onClose: () => void;
  onExportJson: () => void; onImportJson: (f: File) => void; onOpenPdf: (f: File) => void; onReset: () => void;
}) {
  return (
    <Modal title="Project" onClose={props.onClose}>
      <div className="space-y-2">
        <MenuFile label="Open project from PDF" accept=".pdf,application/pdf" onPick={props.onOpenPdf} />
        <MenuFile label="Import project file (.json)" accept=".json,application/json" onPick={props.onImportJson} />
        <button type="button" onClick={props.onExportJson}
          className="w-full min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-left text-base font-semibold text-slate-700">
          Export project file (.json)
        </button>
        <button type="button" onClick={props.onReset}
          className="w-full min-h-tap rounded-xl border border-red-300 px-4 py-3 text-left text-base font-semibold text-red-700">
          Start new project
        </button>
        <p className="pt-1 text-xs text-slate-500">
          The exported PDF embeds the full project — reopen it here with "Open project from PDF" to restore everything.
        </p>
      </div>
    </Modal>
  );
}

function MenuFile({ label, accept, onPick }: { label: string; accept: string; onPick: (f: File) => void }) {
  return (
    <label className="block w-full">
      <span className="block w-full min-h-tap cursor-pointer rounded-xl border border-slate-300 px-4 py-3 text-left text-base font-semibold text-slate-700">
        {label}
      </span>
      <input type="file" accept={accept} className="sr-only"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
    </label>
  );
}
