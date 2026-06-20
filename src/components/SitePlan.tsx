import { useRef } from 'react';
import type { Phase, Plot } from '../types';
import { markerView } from '../markers';

interface Props {
  planImage: string | null;
  plots: Plot[];
  phases: Phase[];
  week: number;
  setupMode: boolean;
  placeMode: boolean;
  drawingRef: React.RefObject<HTMLDivElement>;
  onPlaceAt: (xPct: number, yPct: number) => void;
  onTapPlot: (plot: Plot) => void;
  onMovePlot: (id: string, xPct: number, yPct: number) => void;
  onDeletePlot: (id: string) => void;
  onUpload: (file: File) => void;
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

export default function SitePlan({
  planImage, plots, phases, week, setupMode, placeMode, drawingRef,
  onPlaceAt, onTapPlot, onMovePlot, onDeletePlot, onUpload,
}: Props) {
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean; px: number; py: number } | null>(null);
  const suppressClick = useRef(false);
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  const pctFromEvent = (clientX: number, clientY: number) => {
    const rect = imgWrapRef.current!.getBoundingClientRect();
    return {
      xPct: clampPct(((clientX - rect.left) / rect.width) * 100),
      yPct: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  };

  const handlePlaceClick = (e: React.MouseEvent) => {
    if (!placeMode || !imgWrapRef.current) return;
    const { xPct, yPct } = pctFromEvent(e.clientX, e.clientY);
    onPlaceAt(xPct, yPct);
  };

  // ── marker drag (setup mode) ──────────────────────────────────────────────
  const onMarkerDown = (e: React.PointerEvent, plot: Plot) => {
    if (!setupMode) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: plot.id, moved: false, px: e.clientX, py: e.clientY };
  };
  const onMarkerMove = (e: React.PointerEvent, plot: Plot) => {
    const d = dragRef.current;
    if (!d || d.id !== plot.id || !imgWrapRef.current) return;
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) d.moved = true;
    if (!d.moved) return;
    const { xPct, yPct } = pctFromEvent(e.clientX, e.clientY);
    onMovePlot(plot.id, xPct, yPct);
  };
  const onMarkerUp = () => {
    if (dragRef.current?.moved) suppressClick.current = true;
    dragRef.current = null;
  };
  const onMarkerClick = (e: React.MouseEvent, plot: Plot) => {
    e.stopPropagation();
    if (suppressClick.current) { suppressClick.current = false; return; } // was a drag
    if (placeMode) return;
    onTapPlot(plot);
  };

  if (!planImage) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-slate-700">Upload your site plan to begin</p>
        <p className="max-w-xs text-sm text-slate-500">
          Use a PNG or JPG of your site layout (a PDF page exported as an image works well), or
          import a vector PDF from Setup.
        </p>
        <label className="inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow active:bg-blue-700">
          Upload site plan
          <input type="file" accept="image/*" className="sr-only"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      </div>
    );
  }

  return (
    <div ref={drawingRef} className="relative mx-auto w-full bg-white" style={{ touchAction: 'pan-y' }}>
      <div
        ref={imgWrapRef}
        onClick={handlePlaceClick}
        className={`relative w-full ${placeMode ? 'cursor-crosshair' : ''}`}
      >
        <img src={planImage} alt="Site plan" className="block w-full select-none" draggable={false} />
        {plots.map((plot) => {
          const mv = markerView(plot, phaseById.get(plot.phaseId), week);
          return (
            <div
              key={plot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${plot.xPct}%`, top: `${plot.yPct}%` }}
            >
              <button
                type="button"
                onClick={(e) => onMarkerClick(e, plot)}
                onPointerDown={(e) => onMarkerDown(e, plot)}
                onPointerMove={(e) => onMarkerMove(e, plot)}
                onPointerUp={onMarkerUp}
                title={`Plot ${plot.number} — ${mv.label}${setupMode ? ' (drag to move)' : ''}`}
                className={`flex items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 ${setupMode ? 'cursor-move' : ''}`}
                style={{ width: 38, height: 38, backgroundColor: mv.color, touchAction: setupMode ? 'none' : 'auto' }}
              >
                {plot.number}
              </button>
              {setupMode && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeletePlot(plot.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={`Delete plot ${plot.number}`}
                  className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 text-xs font-bold text-white shadow active:bg-red-700"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
