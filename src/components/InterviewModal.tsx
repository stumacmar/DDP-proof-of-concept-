import { useState } from 'react';
import { Modal, Field } from './PlotEditor';
import { SERVICES } from '../config';
import { formatWeekCommencing } from '../weeks';
import type { Project, ServiceRange } from '../types';

interface Props {
  project: Project;
  onSetSettings: (patch: Partial<Project['settings']>) => void;
  onUpdateServices: (phaseId: string, services: ServiceRange[]) => void;
  onBulkCompletion: (fromNum: number, toNum: number, week: number | null) => void;
  onClose: () => void;
}

/**
 * Guided "interview" that asks the engineer the timescale questions the tool
 * can't read off a drawing, instead of leaving them to hunt through panels.
 */
export default function InterviewModal({ project, onSetSettings, onUpdateServices, onBulkCompletion, onClose }: Props) {
  // Steps: 0 = basics, 1..N = one per phase (service weeks), N+1 = plot completion.
  const phases = project.phases;
  const lastStep = phases.length + 1;
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(lastStep, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const title = step === 0 ? 'Guided setup — basics'
    : step <= phases.length ? `Guided setup — ${phases[step - 1].name} services`
    : 'Guided setup — completion weeks';

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <Progress step={step} total={lastStep} />

        {step === 0 && <BasicsStep project={project} onSet={onSetSettings} />}
        {step >= 1 && step <= phases.length && (
          <ServicesStep
            phase={phases[step - 1]}
            week1Date={project.settings.week1Date}
            maxWeek={project.settings.maxWeek}
            onUpdate={(s) => onUpdateServices(phases[step - 1].id, s)}
          />
        )}
        {step === lastStep && (
          <CompletionStep project={project} onBulk={onBulkCompletion} />
        )}

        <div className="flex gap-2 pt-1">
          {step > 0 && (
            <button type="button" onClick={back}
              className="min-h-tap rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700">Back</button>
          )}
          {step < lastStep ? (
            <button type="button" onClick={next}
              className="flex-1 min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700">Next</button>
          ) : (
            <button type="button" onClick={onClose}
              className="flex-1 min-h-tap rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white active:bg-emerald-700">Done</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${((step + 1) / (total + 1)) * 100}%` }} />
      </div>
      <span className="text-xs text-slate-500">{step + 1}/{total + 1}</span>
    </div>
  );
}

function BasicsStep({ project, onSet }: { project: Project; onSet: (p: Partial<Project['settings']>) => void }) {
  const s = project.settings;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">First, the essentials the week numbers hang off.</p>
      <Field label="Site name">
        <input value={s.siteName} onChange={(e) => onSet({ siteName: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" placeholder="e.g. Meadow View" />
      </Field>
      <Field label="When does Programme Week 1 commence?">
        <input type="date" value={s.week1Date} onChange={(e) => onSet({ week1Date: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
      </Field>
      <Field label="How many weeks does the programme run to?">
        <input type="number" min={4} max={520} value={s.maxWeek}
          onChange={(e) => onSet({ maxWeek: Math.max(4, Number(e.target.value) || 4) })}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
      </Field>
    </div>
  );
}

function ServicesStep({ phase, week1Date, maxWeek, onUpdate }: {
  phase: Project['phases'][number]; week1Date: string; maxWeek: number; onUpdate: (s: ServiceRange[]) => void;
}) {
  const set = (id: string, patch: Partial<ServiceRange>) =>
    onUpdate(phase.services.map((s) => (s.serviceId === id ? { ...s, ...patch } : s)));
  const clamp = (v: number) => Math.min(maxWeek, Math.max(1, v || 1));
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        For <strong>{phase.name}</strong>, which programme week does each service go <strong>live</strong>
        (works complete)? Start week is when it begins on site.
      </p>
      {SERVICES.map((def) => {
        const svc = phase.services.find((s) => s.serviceId === def.id);
        if (!svc) return null;
        return (
          <div key={def.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">{def.label}</span>
            <div className="flex items-center gap-1 text-xs">
              <label className="flex items-center gap-1"><span className="text-slate-400">start</span>
                <input type="number" min={1} max={maxWeek} value={svc.startWeek}
                  onChange={(e) => set(def.id, { startWeek: clamp(Number(e.target.value)) })}
                  className="w-14 rounded border border-slate-300 px-1 py-1 text-center" />
              </label>
              <label className="flex items-center gap-1"><span className="text-slate-400">live</span>
                <input type="number" min={1} max={maxWeek} value={svc.endWeek}
                  onChange={(e) => set(def.id, { endWeek: clamp(Number(e.target.value)) })}
                  className="w-14 rounded border border-slate-300 px-1 py-1 text-center" />
              </label>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-400">Live wk shown as {formatWeekCommencing(week1Date, phase.services[0]?.endWeek ?? 1)} etc.</p>
    </div>
  );
}

function CompletionStep({ project, onBulk }: { project: Project; onBulk: (a: number, b: number, w: number | null) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [wk, setWk] = useState('');
  const withWeek = project.plots.filter((p) => p.completionWeek != null).length;

  const apply = () => {
    const a = parseInt(from, 10), b = parseInt(to, 10);
    if (Number.isFinite(a) && Number.isFinite(b)) onBulk(Math.min(a, b), Math.max(a, b), wk.trim() ? Number(wk) : null);
    setFrom(''); setTo(''); setWk('');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Finally, build <strong>completion weeks</strong> per plot. Set them in ranges — e.g. plots 1–12 complete
        at week 30. ({withWeek} of {project.plots.length} plots have a completion week.)
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Plots from"><input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-base" placeholder="1" /></Field>
        <Field label="to"><input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-base" placeholder="12" /></Field>
        <Field label="Completion wk"><input inputMode="numeric" value={wk} onChange={(e) => setWk(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-base" placeholder="30" /></Field>
      </div>
      <button type="button" onClick={apply} disabled={!from || !to}
        className="w-full min-h-tap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-40">
        Apply to plots {from || '—'}–{to || '—'}
      </button>
      <p className="text-xs text-slate-400">Leave completion week blank to clear it for that range. You can also tap any plot on the plan to fine-tune.</p>
    </div>
  );
}
