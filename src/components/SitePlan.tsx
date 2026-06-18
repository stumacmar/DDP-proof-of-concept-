import { useRef } from 'react';
import type { Phase, Plot } from '../types';
import { markerView } from '../markers';

interface Props {
  planImage: string | null;
  plots: Plot[];
  phases: Phase[];
  week: number;
  placeMode: boolean;
  drawingRef: React.RefObject<HTMLDivElement>;
  onPlaceAt: (xPct: number, yPct: number) => void;
  onTapPlot: (plot: Plot) => void;
  onUpload: (file: File) => void;
}

export default function SitePlan({
  planImage, plots, phases, week, placeMode, drawingRef,
  onPlaceAt, onTapPlot, onUpload,
}: Props) {
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  const handleClick = (e: React.MouseEvent) => {
    if (!placeMode || !imgWrapRef.current) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;
    onPlaceAt(xPct, yPct);
  };

  if (!planImage) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-slate-700">Upload your site plan to begin</p>
        <p className="max-w-xs text-sm text-slate-500">
          Use a PNG or JPG of your site layout (a PDF page exported as an image works well).
        </p>
        <label className="inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow active:bg-blue-700">
          Upload site plan
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
      </div>
    );
  }

  return (
    <div
      ref={drawingRef}
      className="relative mx-auto w-full bg-white"
      style={{ touchAction: 'pan-y' }}
    >
      <div
        ref={imgWrapRef}
        onClick={handleClick}
        className={`relative w-full ${placeMode ? 'cursor-crosshair' : ''}`}
      >
        <img src={planImage} alt="Site plan" className="block w-full select-none" draggable={false} />
        {plots.map((plot) => {
          const mv = markerView(plot, phaseById.get(plot.phaseId), week);
          return (
            <button
              key={plot.id}
              type="button"
              onClick={(e) => {
                if (placeMode) return;
                e.stopPropagation();
                onTapPlot(plot);
              }}
              title={`Plot ${plot.number} — ${mv.label}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
              style={{
                left: `${plot.xPct}%`,
                top: `${plot.yPct}%`,
                width: 38,
                height: 38,
                backgroundColor: mv.color,
              }}
            >
              {plot.number}
            </button>
          );
        })}
      </div>
    </div>
  );
}
