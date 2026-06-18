import { useState } from 'react';
import { BUILD_STAGES } from '../config';
import { occupationStatus } from '../occupation';
import { formatWeekCommencing } from '../weeks';
import type { BuildStageId, Phase, Plot } from '../types';

interface Props {
  plot: Plot;
  phases: Phase[];
  week: number;
  week1Date: string;
  setupMode: boolean;
  onSave: (p: Plot) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function PlotEditor({
  plot, phases, week, week1Date, setupMode, onSave, onDelete, onClose,
}: Props) {
  const [number, setNumber] = useState(plot.number);
  const [stage, setStage] = useState<BuildStageId>(plot.stage);
  const [completionWeek, setCompletionWeek] = useState<string>(
    plot.completionWeek != null ? String(plot.completionWeek) : '',
  );
  const [phaseId, setPhaseId] = useState(plot.phaseId);

  const phase = phases.find((p) => p.id === phaseId);
  const preview = occupationStatus(
    { ...plot, stage, phaseId, completionWeek: completionWeek ? Number(completionWeek) : null },
    phase,
    week,
  );

  const save = () => {
    onSave({
      ...plot,
      number: number.trim() || plot.number,
      stage,
      phaseId,
      completionWeek: completionWeek.trim() ? Number(completionWeek) : null,
    });
  };

  return (
    <Modal title={`Plot ${plot.number}`} onClose={onClose}>
      <div className="space-y-4">
        {setupMode && (
          <Field label="Plot number">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          </Field>
        )}

        <Field label="Build stage">
          <div className="grid grid-cols-1 gap-2">
            {BUILD_STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStage(s.id)}
                className={`flex min-h-tap items-center gap-3 rounded-lg border px-3 py-2 text-left text-base ${
                  stage === s.id ? 'border-blue-600 bg-blue-50 font-semibold' : 'border-slate-300'
                }`}
              >
                <span className="inline-block h-5 w-5 rounded" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Completion week">
          <input
            value={completionWeek}
            onChange={(e) => setCompletionWeek(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="e.g. 30"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
          {completionWeek && (
            <p className="mt-1 text-xs text-slate-500">
              {formatWeekCommencing(week1Date, Number(completionWeek))}
            </p>
          )}
        </Field>

        {phases.length > 1 && (
          <Field label="Phase">
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            >
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}

        <StatusPreview status={preview.status} blockers={preview.blockers} week={week} />

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={save}
            className="flex-1 min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700"
          >
            Save
          </button>
          {setupMode && (
            <button
              type="button"
              onClick={() => onDelete(plot.id)}
              className="min-h-tap rounded-xl border border-red-300 px-4 py-3 text-base font-semibold text-red-700 active:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StatusPreview({ status, blockers, week }: { status: string; blockers: string[]; week: number }) {
  if (status === 'pending') {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
        Not yet at completion week — shown by build stage at Week {week}.
      </p>
    );
  }
  if (status === 'occupiable') {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        Occupiable at Week {week} — occupation rule met.
      </p>
    );
  }
  return (
    <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
      <p className="font-semibold">Conflict at Week {week} — blockers:</p>
      <ul className="ml-4 list-disc">
        {blockers.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-500 active:bg-slate-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
