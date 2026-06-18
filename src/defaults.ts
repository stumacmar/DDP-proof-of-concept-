import { DEFAULT_MAX_WEEK, SERVICES } from './config';
import type { Phase, Project, ServiceRange } from './types';

let idCounter = 0;
export function newId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function defaultServiceRanges(): ServiceRange[] {
  return SERVICES.map((s, i) => ({
    serviceId: s.id,
    startWeek: 1 + i * 2,
    endWeek: 8 + i * 2,
    ...(s.isRoad ? { roadTargetStage: 'binder' as const } : {}),
  }));
}

export function makePhase(name: string): Phase {
  return { id: newId('phase'), name, services: defaultServiceRanges() };
}

export function emptyProject(): Project {
  const monday = mostRecentMonday();
  return {
    version: 1,
    settings: {
      siteName: '',
      week1Date: monday,
      maxWeek: DEFAULT_MAX_WEEK,
    },
    planImage: null,
    plots: [],
    phases: [makePhase('Phase 1')],
  };
}

function mostRecentMonday(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}
