import { describe, it, expect } from 'vitest';
import { occupationStatus, serviceLiveInPhase } from './occupation';
import { OCCUPATION_CONFIG, ROAD_STAGES, SERVICES, roadStageIndex } from './config';
import type { Phase, Plot, RoadStageId, ServiceRange } from './types';

/**
 * Launch-readiness simulation: 100 seeded random projects (dummy layout data,
 * plots, engineering constraints), each modelled through every programme week
 * and checked against an INDEPENDENT oracle re-implementation of the
 * occupation rule. Any divergence between spec and implementation fails.
 */

// Deterministic seeded RNG (mulberry32) so failures are reproducible by seed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

interface Scenario { maxWeek: number; phases: Phase[]; plots: Plot[] }

function makeScenario(seed: number): Scenario {
  const r = rng(seed);
  const maxWeek = int(r, 52, 156);
  const phaseCount = int(r, 1, 3);

  const phases: Phase[] = Array.from({ length: phaseCount }, (_, pi) => {
    const services: ServiceRange[] = SERVICES.map((s) => {
      const startWeek = int(r, 1, Math.floor(maxWeek / 2));
      const endWeek = int(r, startWeek, Math.floor(maxWeek * 0.85));
      return s.isRoad
        ? { serviceId: s.id, startWeek, endWeek, roadTargetStage: pick(r, ROAD_STAGES).id as RoadStageId }
        : { serviceId: s.id, startWeek, endWeek };
    });
    return { id: `ph${pi}`, name: `Phase ${pi + 1}`, services };
  });

  const plots: Plot[] = Array.from({ length: int(r, 5, 60) }, (_, i) => ({
    id: `p${i}`,
    number: String(i + 1),
    xPct: r() * 100,
    yPct: r() * 100,
    stage: pick(r, ['foundations', 'superstructure', 'watertight', 'firstfix', 'complete'] as const),
    completionWeek: r() < 0.15 ? null : int(r, 1, maxWeek),
    phaseId: pick(r, phases).id,
  }));

  return { maxWeek, phases, plots };
}

/** Independent oracle: the occupation rule re-stated from the spec. */
function oracle(plot: Plot, phase: Phase, week: number) {
  const road = phase.services.find((s) => s.serviceId === 'road');
  const minIdx = roadStageIndex(OCCUPATION_CONFIG.roadMinStage);
  const roadOk =
    !!road &&
    roadStageIndex(road.roadTargetStage ?? 'none') >= minIdx &&
    week >= road.endWeek;
  const nonRoadNotLive = phase.services.filter((s) => s.serviceId !== 'road' && s.endWeek > week).length;
  const roadBlockers = roadOk ? 0 : 1;
  const blockerCount = roadBlockers + nonRoadNotLive;

  const completionReached = plot.completionWeek != null && plot.completionWeek <= week;
  const status = !completionReached ? 'pending' : blockerCount === 0 ? 'occupiable' : 'conflict';
  return { status, blockerCount, roadOk };
}

describe('100-scenario time-model simulation', () => {
  const SCENARIOS = 100;

  it(`models ${SCENARIOS} randomized projects through every week without a single spec divergence`, () => {
    let checks = 0;
    const failures: string[] = [];
    const fail = (msg: string) => { if (failures.length < 25) failures.push(msg); };

    for (let seed = 1; seed <= SCENARIOS; seed++) {
      const { maxWeek, phases, plots } = makeScenario(seed);
      const phaseById = new Map(phases.map((p) => [p.id, p]));

      for (const plot of plots) {
        const phase = phaseById.get(plot.phaseId)!;
        let wasOccupiable = false;

        for (let week = 1; week <= maxWeek; week++) {
          const res = occupationStatus(plot, phase, week);
          const exp = oracle(plot, phase, week);
          checks++;

          const ctx = `seed=${seed} plot=${plot.number} week=${week}`;
          // 1. Status matches the independent oracle exactly.
          if (res.status !== exp.status) fail(`${ctx}: status ${res.status} != oracle ${exp.status}`);
          // 2. Blocker count matches the oracle's semantic count.
          if (res.blockers.length !== exp.blockerCount) fail(`${ctx}: ${res.blockers.length} blockers != oracle ${exp.blockerCount}`);
          // 3. Internal consistency: occupiable ⇒ no blockers; conflict ⇒ some.
          if (res.status === 'occupiable' && res.blockers.length > 0) fail(`${ctx}: occupiable with blockers`);
          if (res.status === 'conflict' && res.blockers.length === 0) fail(`${ctx}: conflict without blockers`);
          // 4. Monotonicity: once occupiable, never regresses (static data).
          if (wasOccupiable && res.status !== 'occupiable') fail(`${ctx}: occupiable regressed to ${res.status}`);
          if (res.status === 'occupiable') wasOccupiable = true;
          // 5. serviceLiveInPhase agrees with the week ranges for non-road services.
          for (const svc of phase.services) {
            if (svc.serviceId === 'road') continue;
            if (serviceLiveInPhase(phase, svc.serviceId, week) !== (svc.endWeek <= week)) {
              fail(`${ctx}: serviceLiveInPhase(${svc.serviceId}) inconsistent`);
            }
          }
        }

        // 6. A road programmed below the threshold can never yield occupiable.
        const road = phase.services.find((s) => s.serviceId === 'road')!;
        if (roadStageIndex(road.roadTargetStage ?? 'none') < roadStageIndex(OCCUPATION_CONFIG.roadMinStage) && wasOccupiable) {
          fail(`seed=${seed} plot=${plot.number}: occupiable despite sub-threshold road target`);
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
    // Make the scale of the sweep visible in the test output.
    expect(checks).toBeGreaterThan(100_000);
  });

  it('site-wide occupiable count is non-decreasing through time', () => {
    for (let seed = 1; seed <= SCENARIOS; seed++) {
      const { maxWeek, phases, plots } = makeScenario(seed);
      const phaseById = new Map(phases.map((p) => [p.id, p]));
      let prev = 0;
      for (let week = 1; week <= maxWeek; week++) {
        const count = plots.filter(
          (p) => occupationStatus(p, phaseById.get(p.phaseId), week).status === 'occupiable',
        ).length;
        expect(count, `seed=${seed} week=${week}`).toBeGreaterThanOrEqual(prev);
        prev = count;
      }
    }
  });
});
