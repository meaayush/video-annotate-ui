export type VideoStatus = 'processing' | 'ready' | 'failed';

export interface Video {
  id: string;
  title: string;
  uploadDate: string;
  duration: number; // seconds
  status: VideoStatus;
  thumbnailUrl: string;
  videoUrl?: string;
  fileSize?: number; // bytes
}

// ── Annotations ──

export type AnnotationType = 'auto-frame' | 'manual';

export interface Annotation {
  id: string | null;
  videoId: string;
  type: AnnotationType;
  timestamp: number; // seconds into the video
  note: string;      // user-provided or empty for auto-frames
  createdAt: string;  // ISO date — when the annotation was created
}

/** Returned by the backend: all annotations for a video */
export interface VideoAnnotations {
  videoId: string;
  frameInterval: number | null; // null if no auto-frame was requested
  annotations: Annotation[];
}
