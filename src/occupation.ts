import {
  OCCUPATION_CONFIG,
  ROAD_STAGES,
  roadStageIndex,
  roadStageLabel,
  serviceLabel,
} from './config';
import type { Phase, Plot, RoadStageId } from './types';

export type OccupationStatusValue =
  | 'pending' // not yet at completion week — colour by build stage
  | 'occupiable' // at/after completion week AND rule met
  | 'conflict'; // at/after completion week AND rule NOT met

export interface OccupationResult {
  status: OccupationStatusValue;
  /** Human-readable reasons the occupation rule is not met (always computed). */
  blockers: string[];
}

/**
 * Road reaches its target stage AT its end week. Before the end week the road
 * is treated as not yet reaching that stage ('none').
 */
export function roadStageReached(phase: Phase, week: number): RoadStageId {
  const road = phase.services.find((s) => s.serviceId === 'road');
  if (!road) return 'none';
  if (week >= road.endWeek) return road.roadTargetStage ?? 'none';
  return 'none';
}

/**
 * ── THE OCCUPATION RULE (strict) ──────────────────────────────────────────
 * A plot is OCCUPIABLE at `week` only if, for that plot's phase:
 *   - Road has reached Binder or better by `week`, AND
 *   - every service's END week is <= `week` (all services live).
 *
 * Colouring:
 *   - completionWeek not reached  -> 'pending'
 *   - completion reached & rule met -> 'occupiable'
 *   - completion reached & rule NOT met -> 'conflict'
 *
 * `blockers` is always populated with the specific failing reasons, regardless
 * of status, so the UI/PDF can explain a conflict.
 */
export function occupationStatus(
  plot: Plot,
  phase: Phase | undefined,
  week: number,
): OccupationResult {
  const blockers = computeBlockers(phase, week);

  const completionReached =
    plot.completionWeek != null && plot.completionWeek <= week;

  let status: OccupationStatusValue;
  if (!completionReached) {
    status = 'pending';
  } else {
    status = blockers.length === 0 ? 'occupiable' : 'conflict';
  }

  return { status, blockers };
}

/** The list of reasons the occupation rule is not satisfied at `week`. */
export function computeBlockers(phase: Phase | undefined, week: number): string[] {
  const blockers: string[] = [];
  if (!phase) return ['No phase assigned'];

  // Road: must reach the configured minimum stage by `week`.
  const road = phase.services.find((s) => s.serviceId === 'road');
  const minIdx = roadStageIndex(OCCUPATION_CONFIG.roadMinStage);
  const minLabel = roadStageLabel(OCCUPATION_CONFIG.roadMinStage);
  if (!road) {
    blockers.push(`Road not in programme (needs ${minLabel})`);
  } else {
    const target = road.roadTargetStage ?? 'none';
    const targetIdx = roadStageIndex(target);
    if (targetIdx < minIdx) {
      // The programmed target itself is below the threshold.
      blockers.push(`Road only reaches ${roadStageLabel(target)} (needs ${minLabel})`);
    } else if (week < road.endWeek) {
      // Target is fine, but not reached yet at this week.
      blockers.push(
        `Road reaches ${roadStageLabel(target)} wk ${road.endWeek} (after wk ${week})`,
      );
    }
  }

  // Every non-road service must be live (end week <= selected week).
  for (const svc of phase.services) {
    if (svc.serviceId === 'road') continue;
    if (svc.endWeek > week) {
      blockers.push(
        `${serviceLabel(svc.serviceId)} live wk ${svc.endWeek} (after wk ${week})`,
      );
    }
  }

  return blockers;
}

/** Whether a service's works are complete ("live") in a phase by `week`. */
export function serviceLiveInPhase(
  phase: Phase | undefined,
  serviceId: string,
  week: number,
): boolean {
  const svc = phase?.services.find((s) => s.serviceId === serviceId);
  return svc ? week >= svc.endWeek : false;
}

// Re-export for convenience in tests / UI.
export { ROAD_STAGES };
