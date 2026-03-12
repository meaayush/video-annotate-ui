import type { VideoAnnotations, Annotation } from '../types/video';

// Helper: generate auto-frame annotations at a given interval
function generateAutoFrames(
  videoId: string,
  duration: number,
  interval: number,
): Annotation[] {
  const frames: Annotation[] = [];
  for (let t = 0; t <= duration; t += interval) {
    frames.push({
      id: `${videoId}-auto-${t}`,
      videoId,
      type: 'auto-frame',
      timestamp: t,
      note: '',
      createdAt: '2026-03-10T15:00:00Z',
    });
  }
  return frames;
}

// Mock manual annotations per video
const manualAnnotationsMap: Record<string, Omit<Annotation, 'videoId'>[]> = {
  '1': [
    { id: 'm1-1', type: 'manual', timestamp: 12, note: 'Intro sequence starts', createdAt: '2026-03-10T15:10:00Z' },
    { id: 'm1-2', type: 'manual', timestamp: 45, note: 'Key feature showcase', createdAt: '2026-03-10T15:12:00Z' },
    { id: 'm1-3', type: 'manual', timestamp: 120, note: 'Pricing section – needs review', createdAt: '2026-03-10T15:15:00Z' },
    { id: 'm1-4', type: 'manual', timestamp: 340, note: 'CTA placement looks off', createdAt: '2026-03-10T15:20:00Z' },
    { id: 'm1-5', type: 'manual', timestamp: 600, note: 'Closing – good energy', createdAt: '2026-03-10T15:25:00Z' },
  ],
  '2': [
    { id: 'm2-1', type: 'manual', timestamp: 30, note: 'Sprint goals overview', createdAt: '2026-03-09T10:00:00Z' },
    { id: 'm2-2', type: 'manual', timestamp: 250, note: 'Blocker discussion', createdAt: '2026-03-09T10:05:00Z' },
    { id: 'm2-3', type: 'manual', timestamp: 900, note: 'Action items recap', createdAt: '2026-03-09T10:10:00Z' },
  ],
  '4': [
    { id: 'm4-1', type: 'manual', timestamp: 5, note: 'Welcome screen', createdAt: '2026-03-07T12:00:00Z' },
    { id: 'm4-2', type: 'manual', timestamp: 180, note: 'Account setup flow', createdAt: '2026-03-07T12:05:00Z' },
    { id: 'm4-3', type: 'manual', timestamp: 420, note: 'Dashboard tour', createdAt: '2026-03-07T12:10:00Z' },
  ],
  '6': [
    { id: 'm6-1', type: 'manual', timestamp: 60, note: 'Architecture overview diagram', createdAt: '2026-03-05T11:00:00Z' },
    { id: 'm6-2', type: 'manual', timestamp: 600, note: 'Microservices breakdown', createdAt: '2026-03-05T11:10:00Z' },
    { id: 'm6-3', type: 'manual', timestamp: 1800, note: 'Database layer discussion', createdAt: '2026-03-05T11:30:00Z' },
    { id: 'm6-4', type: 'manual', timestamp: 3600, note: 'Scaling strategy', createdAt: '2026-03-05T12:00:00Z' },
  ],
};

// Frame intervals selected at upload time per video
const frameIntervalMap: Record<string, number | null> = {
  '1': 5,
  '2': 10,
  '4': 5,
  '6': 10,
};

// Duration map for generating auto-frames
const durationMap: Record<string, number> = {
  '1': 754,
  '2': 1832,
  '4': 612,
  '6': 5400,
};

/**
 * Fetch annotations for a video.
 * Replace this with an actual API call when the backend is ready.
 *
 * Example backend endpoint: GET /api/videos/:videoId/annotations
 * Response shape matches VideoAnnotations.
 */
export async function fetchAnnotations(videoId: string): Promise<VideoAnnotations> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 200));

  const interval = frameIntervalMap[videoId] ?? null;
  const duration = durationMap[videoId] ?? 0;

  const autoFrames =
    interval && duration > 0
      ? generateAutoFrames(videoId, duration, interval)
      : [];

  const manuals: Annotation[] = (manualAnnotationsMap[videoId] ?? []).map((a) => ({
    ...a,
    videoId,
  }));

  return {
    videoId,
    frameInterval: interval,
    annotations: [...autoFrames, ...manuals].sort((a, b) => a.timestamp - b.timestamp),
  };
}

/**
 * Add a manual annotation to a video.
 * Replace with: POST /api/videos/:videoId/annotations { timestamp, note }
 */
export async function addAnnotation(
  videoId: string,
  timestamp: number,
  note: string,
): Promise<Annotation> {
  await new Promise((r) => setTimeout(r, 100));

  return {
    id: `m-${Date.now()}`,
    videoId,
    type: 'manual',
    timestamp,
    note,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Update an annotation's note.
 * Replace with: PATCH /api/annotations/:annotationId { note }
 */
export async function updateAnnotationNote(
  annotationId: string,
  note: string,
): Promise<{ id: string; note: string }> {
  await new Promise((r) => setTimeout(r, 100));
  return { id: annotationId, note };
}

/**
 * Delete an annotation.
 * Replace with: DELETE /api/annotations/:annotationId
 */
export async function deleteAnnotation(annotationId: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  void annotationId;
}
