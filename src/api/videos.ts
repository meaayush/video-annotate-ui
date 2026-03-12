import { apiClient } from './client';
import type { Video } from '../types/video';

// ── Raw backend response shapes (snake_case) ──

interface VideoListItemRaw {
  id: string;
  title: string;
  duration: number;
  thumbnail_url: string;
  status: string;
  created_at: string;
}

interface VideoListResponse {
  videos: VideoListItemRaw[];
}

// ── Mappers ──

function mapVideoListItem(raw: VideoListItemRaw): Video {
  return {
    id: raw.id,
    title: raw.title,
    duration: raw.duration,
    status: raw.status as Video['status'],
    thumbnailUrl: raw.thumbnail_url ?? '',
    uploadDate: raw.created_at,
    // These may come from a detail endpoint later
    videoUrl: '',
    fileSize: 0,
  };
}

// ── API calls ──

/** GET /video/list */
export async function fetchVideos(): Promise<Video[]> {
  const data = await apiClient<VideoListResponse>('/video/list');
  return data.videos.map(mapVideoListItem);
}

// ── Video Detail ──

interface VideoDetailRaw {
  id: string;
  title: string;
  duration: number;
  thumbnail_url: string;
  video_url: string;
  source_type: string;
  status: string;
  auto_annotation_interval: number | null;
  created_at: string;
  updated_at: string;
}

function mapVideoDetail(raw: VideoDetailRaw): Video {
  return {
    id: raw.id,
    title: raw.title,
    duration: raw.duration,
    status: raw.status as Video['status'],
    thumbnailUrl: raw.thumbnail_url ?? '',
    uploadDate: raw.created_at,
    videoUrl: raw.video_url ?? '',
    fileSize: 0,
  };
}

/** GET /video/:id */
export async function fetchVideoDetail(videoId: string): Promise<Video> {
  const raw = await apiClient<VideoDetailRaw>(`/video/${videoId}`);
  return mapVideoDetail(raw);
}

// ── Upload by URL ──

interface UploadByUrlRequest {
  title: string;
  url: string;
  auto_annotation_interval?: number | null;
}

interface UploadByUrlResponse {
  video_id: string;
  status: string;
  message: string;
}

/** POST /video/upload/url */
export async function uploadVideoByUrl(
  payload: UploadByUrlRequest,
): Promise<UploadByUrlResponse> {
  return apiClient<UploadByUrlResponse>('/video/upload/url', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Local File Upload (signed-URL → S3 → confirm) ──

interface SignedUrlRequest {
  title: string;
  content_type: string;
  auto_annotation_interval?: number | null;
}

interface SignedUrlResponse {
  video_id: string;
  signed_url: string;
  s3_key: string;
}

interface ConfirmUploadRequest {
  video_id: string;
  s3_key: string;
}

/** Step 1 — POST /video/upload/signed-url */
export async function getSignedUploadUrl(
  payload: SignedUrlRequest,
): Promise<SignedUrlResponse> {
  return apiClient<SignedUrlResponse>('/video/upload/signed-url', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Step 2 — PUT the file to the S3 presigned URL.
 * Uses XMLHttpRequest so we can report real upload progress.
 * Returns a handle with a `promise` and an `abort()` function.
 */
export function uploadFileToS3(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('Network error during upload')),
    );
    xhr.addEventListener('abort', () =>
      reject(new Error('Upload cancelled')),
    );

    xhr.send(file);
  });

  return { promise, abort: () => xhr.abort() };
}

/** Step 3 — POST /video/upload/confirm */
export async function confirmUpload(
  payload: ConfirmUploadRequest,
): Promise<{ message: string }> {
  return apiClient<{ message: string }>('/video/upload/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Auto Annotations (paginated) ──

interface AutoAnnotationRaw {
  id: string | null;
  type: string;
  source: string;
  frame_number: number | null;
  timestamp: number;
  content: string;
  note: string | null;
  created_at: string | null;
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AutoAnnotationsResponse {
  annotations: AutoAnnotationRaw[];
  pagination: PaginationInfo;
  auto_annotation_interval: number | null;
  duration: number;
}

export interface AutoAnnotationItem {
  id: string | null;
  timestamp: number;
  content: string;
  note: string | null;
  createdAt: string | null;
}

export interface AutoAnnotationsPaginated {
  items: AutoAnnotationItem[];
  page: number;
  totalPages: number;
  total: number;
  autoAnnotationInterval: number | null;
}

function mapAutoAnnotation(raw: AutoAnnotationRaw): AutoAnnotationItem {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    content: raw.content,
    note: raw.note,
    createdAt: raw.created_at,
  };
}

/** GET /video/:id/auto-annotations?page=&page_size= */
export async function fetchAutoAnnotations(
  videoId: string,
  page = 1,
  pageSize = 50,
): Promise<AutoAnnotationsPaginated> {
  const data = await apiClient<AutoAnnotationsResponse>(
    `/video/${videoId}/auto-annotations?page=${page}&page_size=${pageSize}`,
  );
  return {
    items: data.annotations.map(mapAutoAnnotation),
    page: data.pagination.page,
    totalPages: data.pagination.total_pages,
    total: data.pagination.total,
    autoAnnotationInterval: data.auto_annotation_interval,
  };
}

// ── Save / Update Auto Annotation ──

interface SaveAutoAnnotationRequest {
  timestamp: number;
  content: string;
  note: string;
}

interface SaveAutoAnnotationResponse {
  id: string;
  type: string;
  source: string;
  timestamp: number;
  content: string;
  created_at: string;
}

// ── Update Auto Annotation Interval ──

interface UpdateIntervalResponse {
  video_id: string;
  auto_annotation_interval: number;
}

/** PATCH /video/:id/auto-annotation-interval */
export async function updateAutoAnnotationInterval(
  videoId: string,
  interval: number,
): Promise<UpdateIntervalResponse> {
  return apiClient<UpdateIntervalResponse>(
    `/video/${videoId}/auto-annotation-interval`,
    {
      method: 'PATCH',
      body: JSON.stringify({ auto_annotation_interval: interval }),
    },
  );
}

/** POST /video/:id/auto-annotations — create a NEW auto annotation (id was null) */
export async function createAutoAnnotation(
  videoId: string,
  payload: SaveAutoAnnotationRequest,
): Promise<SaveAutoAnnotationResponse> {
  return apiClient<SaveAutoAnnotationResponse>(
    `/video/${videoId}/auto-annotations`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

// ── Shared Annotation Patch & Delete ──

interface AnnotationRaw {
  id: string;
  type: string;
  source: string;
  frame_number: number | null;
  timestamp: number;
  content: string;
  created_at: string;
}

/** PATCH /video/:id/annotations/:annotationId — update content (works for both manual & auto) */
export async function patchAnnotation(
  videoId: string,
  annotationId: string,
  content: string,
): Promise<AnnotationRaw> {
  return apiClient<AnnotationRaw>(
    `/video/${videoId}/annotations/${annotationId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    },
  );
}

/** DELETE /video/:id/annotations/:annotationId */
export async function deleteAnnotationById(
  videoId: string,
  annotationId: string,
): Promise<void> {
  await apiClient<unknown>(
    `/video/${videoId}/annotations/${annotationId}`,
    { method: 'DELETE' },
  );
}

// ── Manual Annotations ──

export interface ManualAnnotationItem {
  id: string;
  timestamp: number;
  content: string;
  createdAt: string;
}

/** GET /video/:id/annotations */
export async function fetchManualAnnotations(
  videoId: string,
): Promise<ManualAnnotationItem[]> {
  const data = await apiClient<{ annotations: AnnotationRaw[] }>(`/video/${videoId}/annotations`);
  return data.annotations.map((raw) => ({
    id: raw.id,
    timestamp: raw.timestamp,
    content: raw.content,
    createdAt: raw.created_at,
  }));
}

/** POST /video/:id/annotations — create a manual annotation */
export async function createManualAnnotation(
  videoId: string,
  timestamp: number,
  content: string,
): Promise<ManualAnnotationItem> {
  const raw = await apiClient<AnnotationRaw>(
    `/video/${videoId}/annotations`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'timestamp', timestamp, content }),
    },
  );
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    content: raw.content,
    createdAt: raw.created_at,
  };
}
