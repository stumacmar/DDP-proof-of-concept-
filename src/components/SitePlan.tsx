import { useRef, useState } from 'react';
import type { Phase, Plot, RoutePoint, ServiceRoute } from '../types';
import { markerView } from '../markers';
import { serviceColor } from '../config';
import { serviceLiveInPhase } from '../occupation';

interface Props {
  planImage: string | null;
  plots: Plot[];
  phases: Phase[];
  routes: ServiceRoute[];
  week: number;
  setupMode: boolean;
  placeMode: boolean;
  /** Service id currently being traced, or null. */
  tracingServiceId: string | null;
  /** Vertices of the in-progress route. */
  activePoints: RoutePoint[];
  drawingRef: React.RefObject<HTMLDivElement>;
  onPlaceAt: (xPct: number, yPct: number) => void;
  onTapPlot: (plot: Plot) => void;
  onMovePlot: (id: string, xPct: number, yPct: number) => void;
  onDeletePlot: (id: string) => void;
  onTracePoint: (xPct: number, yPct: number) => void;
  onTapRoute: (id: string) => void;
  onUpload: (file: File) => void;
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

export default function SitePlan({
  planImage, plots, phases, routes, week, setupMode, placeMode,
  tracingServiceId, activePoints, drawingRef,
  onPlaceAt, onTapPlot, onMovePlot, onDeletePlot, onTracePoint, onTapRoute, onUpload,
}: Props) {
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean; px: number; py: number } | null>(null);
  const suppressClick = useRef(false);
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  // ── zoom / pan ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ active: boolean; moved: boolean; px: number; py: number; ox: number; oy: number } | null>(null);

  const pctFromEvent = (clientX: number, clientY: number) => {
    const rect = imgWrapRef.current!.getBoundingClientRect();
    return {
      xPct: clampPct(((clientX - rect.left) / rect.width) * 100),
      yPct: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  };

  const tapping = (placeMode || tracingServiceId != null);

  // Background pointer: pan when zoomed, otherwise a tap places a plot / route point.
  const onBgPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.marker) return; // markers handle themselves
    panRef.current = { active: true, moved: false, px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p?.active) return;
    if (Math.hypot(e.clientX - p.px, e.clientY - p.py) > 4) p.moved = true;
    if (p.moved && zoom > 1) setPan({ x: p.ox + (e.clientX - p.px), y: p.oy + (e.clientY - p.py) });
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    const p = panRef.current;
    panRef.current = null;
    if (!p) return;
    if (p.moved) return; // it was a pan, not a tap
    if ((e.target as HTMLElement).dataset.marker) return;
    if (!tapping || !imgWrapRef.current) return;
    const { xPct, yPct } = pctFromEvent(e.clientX, e.clientY);
    if (tracingServiceId != null) onTracePoint(xPct, yPct);
    else if (placeMode) onPlaceAt(xPct, yPct);
  };

  const zoomBy = (f: number) => setZoom((z) => Math.min(6, Math.max(1, +(z * f).toFixed(3))));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const onWheel = (e: React.WheelEvent) => {
    if (!setupMode && !tapping) return;
    if (e.deltaY < 0) zoomBy(1.15); else zoomBy(1 / 1.15);
  };

  // ── marker drag ──────────────────────────────────────────────────────────
  const onMarkerDown = (e: React.PointerEvent, plot: Plot) => {
    if (!setupMode || tracingServiceId != null) return;
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
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (tapping) return;
    onTapPlot(plot);
  };

  if (!planImage) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-slate-700">Upload your site plan to begin</p>
        <p className="max-w-xs text-sm text-slate-500">
          Use a PNG or JPG of your site layout, or import a vector PDF from Setup.
        </p>
        <label className="inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow active:bg-blue-700">
          Upload site plan
          <input type="file" accept="image/*" className="sr-only"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      </div>
    );
  }

  const points = (pts: RoutePoint[]) => pts.map((p) => `${p.xPct},${p.yPct}`).join(' ');

  return (
    <div className="relative">
      <div ref={drawingRef} className="relative mx-auto w-full overflow-hidden bg-white" style={{ touchAction: 'pan-y' }}>
        <div
          ref={imgWrapRef}
          onClick={(e) => { if (tapping && !panRef.current) e.stopPropagation(); }}
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          onWheel={onWheel}
          className={`relative w-full origin-top-left ${tapping ? 'cursor-crosshair' : zoom > 1 ? 'cursor-grab' : ''}`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, touchAction: tapping ? 'none' : 'auto' }}
        >
          <img src={planImage} alt="Site plan" className="block w-full select-none" draggable={false} />

          {/* services overlay */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {routes.map((r) => {
              if (r.points.length < 2) return null;
              const live = serviceLiveInPhase(phaseById.get(r.phaseId), r.serviceId, week);
              return (
                <polyline
                  key={r.id}
                  points={points(r.points)}
                  fill="none"
                  stroke={live ? serviceColor(r.serviceId) : '#94a3b8'}
                  strokeWidth={live ? 4 : 3}
                  strokeDasharray={live ? undefined : '4 3'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className={setupMode && tracingServiceId == null ? 'pointer-events-auto cursor-pointer' : ''}
                  onClick={(e) => { if (setupMode && tracingServiceId == null) { e.stopPropagation(); onTapRoute(r.id); } }}
                />
              );
            })}
            {activePoints.length > 0 && tracingServiceId != null && (
              <polyline
                points={points(activePoints)}
                fill="none"
                stroke={serviceColor(tracingServiceId)}
                strokeWidth={4}
                strokeDasharray="5 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {plots.map((plot) => {
            const mv = markerView(plot, phaseById.get(plot.phaseId), week);
            return (
              <div key={plot.id} data-marker className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${plot.xPct}%`, top: `${plot.yPct}%` }}>
                <button
                  type="button" data-marker
                  onClick={(e) => onMarkerClick(e, plot)}
                  onPointerDown={(e) => onMarkerDown(e, plot)}
                  onPointerMove={(e) => onMarkerMove(e, plot)}
                  onPointerUp={onMarkerUp}
                  title={`Plot ${plot.number} — ${mv.label}${setupMode ? ' (drag to move)' : ''}`}
                  className={`flex items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 ${setupMode && tracingServiceId == null ? 'cursor-move' : ''}`}
                  style={{ width: 38, height: 38, backgroundColor: mv.color, touchAction: setupMode ? 'none' : 'auto' }}
                >
                  {plot.number}
                </button>
                {setupMode && tracingServiceId == null && (
                  <button type="button" data-marker
                    onClick={(e) => { e.stopPropagation(); onDeletePlot(plot.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Delete plot ${plot.number}`}
                    className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 text-xs font-bold text-white shadow active:bg-red-700">
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom in"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/90 text-xl font-bold text-slate-700 shadow active:bg-slate-100">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/90 text-xl font-bold text-slate-700 shadow active:bg-slate-100">−</button>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <button type="button" onClick={resetView} aria-label="Reset view"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/90 text-xs font-semibold text-slate-700 shadow active:bg-slate-100">1:1</button>
        )}
      </div>
    </div>
  );
}
