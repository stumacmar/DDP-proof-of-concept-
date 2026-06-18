import { buildStage, STATUS_COLORS } from './config';
import { occupationStatus, type OccupationResult } from './occupation';
import type { Phase, Plot } from './types';

export interface MarkerView extends OccupationResult {
  color: string;
  label: string;
}

/** Colour + status for a plot marker at the selected week. */
export function markerView(plot: Plot, phase: Phase | undefined, week: number): MarkerView {
  const res = occupationStatus(plot, phase, week);
  let color: string;
  let label: string;
  if (res.status === 'occupiable') {
    color = STATUS_COLORS.occupiable;
    label = 'Occupiable';
  } else if (res.status === 'conflict') {
    color = STATUS_COLORS.conflict;
    label = 'Conflict';
  } else {
    const s = buildStage(plot.stage);
    color = s.color;
    label = s.label;
  }
  return { ...res, color, label };
}
