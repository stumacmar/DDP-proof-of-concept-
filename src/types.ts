export type BuildStageId =
  | 'foundations'
  | 'superstructure'
  | 'watertight'
  | 'firstfix'
  | 'complete';

export type RoadStageId =
  | 'none'
  | 'subbase'
  | 'base'
  | 'binder'
  | 'surface'
  | 'adopted';

export type ServiceId =
  | 'foul'
  | 'surface'
  | 'potable'
  | 'gas'
  | 'electric'
  | 'streetlighting'
  | 'comms'
  | 'road';

export interface Plot {
  id: string;
  /** The number shown on the marker. Editable. Join key for CSV import. */
  number: string;
  /** Position as a percentage of the image (0–100) so it scales. */
  xPct: number;
  yPct: number;
  stage: BuildStageId;
  /** Programme week the plot reaches build completion. null = not set. */
  completionWeek: number | null;
  phaseId: string;
}

export interface ServiceRange {
  serviceId: ServiceId;
  startWeek: number;
  endWeek: number;
  /** Only meaningful for serviceId === 'road'. */
  roadTargetStage?: RoadStageId;
}

export interface Phase {
  id: string;
  name: string;
  services: ServiceRange[];
}

/** A point on a traced service route, as a percentage of the plan image. */
export interface RoutePoint {
  xPct: number;
  yPct: number;
}

/** A spatial route highlighting where a service runs on the plan. */
export interface ServiceRoute {
  id: string;
  serviceId: ServiceId;
  phaseId: string;
  points: RoutePoint[];
}

export interface Settings {
  siteName: string;
  /** ISO date (YYYY-MM-DD) of the Monday that Programme Week 1 commences. */
  week1Date: string;
  maxWeek: number;
}

export interface Project {
  version: number;
  settings: Settings;
  /** Site plan image as a base64 data URL, or null until uploaded. */
  planImage: string | null;
  plots: Plot[];
  phases: Phase[];
  /** Spatial service routes drawn over the plan. */
  routes: ServiceRoute[];
}
