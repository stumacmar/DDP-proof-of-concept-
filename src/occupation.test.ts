import { describe, it, expect } from 'vitest';
import { occupationStatus, roadStageReached } from './occupation';
import { SERVICES } from './config';
import type { Phase, Plot, RoadStageId, ServiceRange } from './types';

/** Build a phase where every non-road service ends at `serviceEnd`, and road
 *  reaches `roadTarget` at `roadEnd`. */
function phase(opts: { serviceEnd: number; roadEnd: number; roadTarget: RoadStageId }): Phase {
  const services: ServiceRange[] = SERVICES.map((s) => {
    if (s.id === 'road') {
      return { serviceId: 'road', startWeek: 1, endWeek: opts.roadEnd, roadTargetStage: opts.roadTarget };
    }
    return { serviceId: s.id, startWeek: 1, endWeek: opts.serviceEnd };
  });
  return { id: 'ph1', name: 'Phase 1', services };
}

function plot(completionWeek: number | null): Plot {
  return { id: 'p1', number: '1', xPct: 50, yPct: 50, stage: 'complete', completionWeek, phaseId: 'ph1' };
}

describe('roadStageReached', () => {
  it('returns none before the road end week', () => {
    expect(roadStageReached(phase({ serviceEnd: 10, roadEnd: 20, roadTarget: 'binder' }), 19)).toBe('none');
  });
  it('returns the target stage from the end week onward', () => {
    expect(roadStageReached(phase({ serviceEnd: 10, roadEnd: 20, roadTarget: 'binder' }), 20)).toBe('binder');
  });
});

describe('occupationStatus', () => {
  it('is pending before completion week', () => {
    const res = occupationStatus(plot(40), phase({ serviceEnd: 10, roadEnd: 10, roadTarget: 'surface' }), 30);
    expect(res.status).toBe('pending');
  });

  it('is pending when completion week is unset', () => {
    expect(occupationStatus(plot(null), phase({ serviceEnd: 10, roadEnd: 10, roadTarget: 'surface' }), 99).status).toBe('pending');
  });

  it('is occupiable when completion reached, all services live and road >= binder', () => {
    const res = occupationStatus(plot(30), phase({ serviceEnd: 20, roadEnd: 25, roadTarget: 'binder' }), 30);
    expect(res.status).toBe('occupiable');
    expect(res.blockers).toEqual([]);
  });

  it('flags conflict and lists a service not yet live', () => {
    const res = occupationStatus(plot(30), phase({ serviceEnd: 38, roadEnd: 10, roadTarget: 'surface' }), 30);
    expect(res.status).toBe('conflict');
    expect(res.blockers).toContain('Foul drainage live wk 38 (after wk 30)');
  });

  it('flags conflict when the road target is below binder', () => {
    const res = occupationStatus(plot(30), phase({ serviceEnd: 10, roadEnd: 10, roadTarget: 'base' }), 30);
    expect(res.status).toBe('conflict');
    expect(res.blockers.some((b) => b.includes('Road only reaches Base'))).toBe(true);
  });

  it('flags conflict when road target is fine but not reached yet', () => {
    const res = occupationStatus(plot(30), phase({ serviceEnd: 10, roadEnd: 40, roadTarget: 'surface' }), 30);
    expect(res.status).toBe('conflict');
    expect(res.blockers.some((b) => b.includes('Road reaches Surface wk 40 (after wk 30)'))).toBe(true);
  });

  it('binder exactly meets the threshold (boundary)', () => {
    const res = occupationStatus(plot(25), phase({ serviceEnd: 25, roadEnd: 25, roadTarget: 'binder' }), 25);
    expect(res.status).toBe('occupiable');
  });
});
