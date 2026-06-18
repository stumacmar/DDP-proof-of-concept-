import { ROAD_STAGES, SERVICES } from '../config';
import type { Phase, RoadStageId, ServiceRange } from '../types';

interface Props {
  phase: Phase;
  maxWeek: number;
  selectedWeek: number;
  onChange: (services: ServiceRange[]) => void;
}

/**
 * Compact Gantt-style editor: one row per service with typed start/end week
 * fields and a mini bar rendered on a shared week ruler.
 */
export default function ServicesPanel({ phase, maxWeek, selectedWeek, onChange }: Props) {
  const update = (id: string, patch: Partial<ServiceRange>) => {
    onChange(phase.services.map((s) => (s.serviceId === id ? { ...s, ...patch } : s)));
  };

  const clampWeek = (v: number) => Math.min(maxWeek, Math.max(1, v || 1));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Service</span>
        <span>Programme (wk 1–{maxWeek})</span>
      </div>

      {SERVICES.map((def) => {
        const svc = phase.services.find((s) => s.serviceId === def.id);
        if (!svc) return null;
        const startPct = ((svc.startWeek - 1) / (maxWeek - 1)) * 100;
        const endPct = ((svc.endWeek - 1) / (maxWeek - 1)) * 100;
        const live = selectedWeek >= svc.endWeek;
        return (
          <div key={def.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{def.label}</span>
              <div className="flex items-center gap-1 text-xs">
                <label className="flex items-center gap-1">
                  <span className="text-slate-400">start</span>
                  <input
                    type="number"
                    min={1}
                    max={maxWeek}
                    value={svc.startWeek}
                    onChange={(e) => update(def.id, { startWeek: clampWeek(Number(e.target.value)) })}
                    className="w-14 rounded border border-slate-300 px-1 py-1 text-center"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-slate-400">end</span>
                  <input
                    type="number"
                    min={1}
                    max={maxWeek}
                    value={svc.endWeek}
                    onChange={(e) => update(def.id, { endWeek: clampWeek(Number(e.target.value)) })}
                    className="w-14 rounded border border-slate-300 px-1 py-1 text-center"
                  />
                </label>
              </div>
            </div>

            {/* mini bar on the week ruler */}
            <div className="relative mt-2 h-4 rounded bg-slate-100">
              <div
                className={`absolute top-0 h-4 rounded ${live ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{
                  left: `${Math.max(0, Math.min(100, startPct))}%`,
                  width: `${Math.max(2, Math.min(100, endPct) - Math.max(0, startPct))}%`,
                }}
              />
              <div
                className="absolute top-[-3px] h-[22px] w-0.5 bg-slate-800"
                style={{ left: `${((selectedWeek - 1) / (maxWeek - 1)) * 100}%` }}
                title={`Selected week ${selectedWeek}`}
              />
            </div>

            {def.isRoad && (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">Target stage at end week</span>
                <select
                  value={svc.roadTargetStage ?? 'binder'}
                  onChange={(e) => update(def.id, { roadTargetStage: e.target.value as RoadStageId })}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  {ROAD_STAGES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
