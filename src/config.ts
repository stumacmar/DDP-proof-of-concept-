import type { BuildStageId, RoadStageId, ServiceId } from './types';

/**
 * ── SINGLE SOURCE OF TRUTH FOR DOMAIN CONFIG ──────────────────────────────
 * Build stages, services, road stages, colours and the occupation-rule
 * thresholds all live here so a technical director can change them in one
 * place. Colours use the Okabe–Ito colour-blind-safe palette.
 */

export interface BuildStageDef {
  id: BuildStageId;
  label: string;
  color: string;
}

/** Order = build progression order. */
export const BUILD_STAGES: readonly BuildStageDef[] = [
  { id: 'foundations', label: 'Foundations', color: '#E69F00' }, // orange
  { id: 'superstructure', label: 'Superstructure', color: '#56B4E9' }, // sky blue
  { id: 'watertight', label: 'Roof / Watertight', color: '#0072B2' }, // blue
  { id: 'firstfix', label: 'First fix', color: '#CC79A7' }, // reddish purple
  { id: 'complete', label: 'Complete', color: '#444444' }, // dark grey
];

export interface RoadStageDef {
  id: RoadStageId;
  label: string;
}

/** Order = road construction progression order; index is used for thresholds. */
export const ROAD_STAGES: readonly RoadStageDef[] = [
  { id: 'none', label: 'None' },
  { id: 'subbase', label: 'Sub-base' },
  { id: 'base', label: 'Base' },
  { id: 'binder', label: 'Binder' },
  { id: 'surface', label: 'Surface' },
  { id: 'adopted', label: 'Adopted' },
];

export interface ServiceDef {
  id: ServiceId;
  label: string;
  /** Colour used for this service's traced route on the plan when live. */
  color: string;
  /** Road carries an extra "target stage reached at end week" field. */
  isRoad?: boolean;
}

export const SERVICES: readonly ServiceDef[] = [
  { id: 'foul', label: 'Foul drainage', color: '#8c510a' },
  { id: 'surface', label: 'Surface water', color: '#1f78b4' },
  { id: 'potable', label: 'Potable water', color: '#33a02c' },
  { id: 'gas', label: 'Gas', color: '#e31a1c' },
  { id: 'electric', label: 'Electric', color: '#ff7f00' },
  { id: 'streetlighting', label: 'Street lighting', color: '#6a3d9a' },
  { id: 'comms', label: 'Comms / fibre', color: '#b15928' },
  { id: 'road', label: 'Road', color: '#444444', isRoad: true },
];

export const serviceColor = (id: string): string =>
  SERVICES.find((s) => s.id === id)?.color ?? '#444444';

/** Status colours (distinct from every build-stage colour above). */
export const STATUS_COLORS = {
  occupiable: '#009E73', // bluish green
  conflict: '#D55E00', // vermillion
  pending: '#94a3b8', // slate (overlaid by stage colour in practice)
} as const;

/**
 * ── OCCUPATION RULE THRESHOLDS ────────────────────────────────────────────
 * Minimum road stage that must be reached for a plot to be occupiable.
 * Change this single value to re-tune the rule.
 */
export const OCCUPATION_CONFIG = {
  roadMinStage: 'binder' as RoadStageId,
};

export const DEFAULT_MAX_WEEK = 104;

// ── lookup helpers ──────────────────────────────────────────────────────
export const buildStage = (id: BuildStageId): BuildStageDef =>
  BUILD_STAGES.find((s) => s.id === id) ?? BUILD_STAGES[0];

export const roadStageIndex = (id: RoadStageId): number =>
  ROAD_STAGES.findIndex((s) => s.id === id);

export const roadStageLabel = (id: RoadStageId): string =>
  ROAD_STAGES.find((s) => s.id === id)?.label ?? id;

export const serviceLabel = (id: ServiceId): string =>
  SERVICES.find((s) => s.id === id)?.label ?? id;
