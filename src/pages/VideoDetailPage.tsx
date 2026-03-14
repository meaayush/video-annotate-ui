import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import { fetchVideoDetail } from '../api/videos';
import type { ManualAnnotationItem, TimestampAnnotationItem, FrameAnnotationItem } from '../api/videos';
import { VideoPlayer } from '../components/VideoPlayer';
import type { VideoPlayerHandle, TimelineFrameRange } from '../components/VideoPlayer';
import { AnnotationPanel } from '../components/AnnotationPanel';
import { formatDate, formatDuration } from '../utils/format';
import type { Video } from '../types/video';
import '../App.css';

export function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const playerRef = useRef<VideoPlayerHandle>(null);

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [manualMarkers, setManualMarkers] = useState<ManualAnnotationItem[]>([]);

  // Range-select state (shared between VideoPlayer and AnnotationPanel)
  const [rangeSelectMode, setRangeSelectMode] = useState(false);
  const [pendingRange, setPendingRange] = useState<{ start: number; end: number } | null>(null);

  // Fetch video detail from backend
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchVideoDetail(id)
      .then((v) => setVideo(v))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load video'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDurationChange = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const handleMarkersChange = useCallback((markers: ManualAnnotationItem[]) => {
    setManualMarkers(markers);
  }, []);

  const handleStartRangeSelect = useCallback(() => {
    setRangeSelectMode(true);
    setPendingRange(null);
  }, []);

  const handleRangeSelected = useCallback((start: number, end: number) => {
    setRangeSelectMode(false);
    setPendingRange({ start, end });
  }, []);

  const handleCancelRangeSelect = useCallback(() => {
    setRangeSelectMode(false);
    setPendingRange(null);
  }, []);

  // Split manual markers into point markers and frame ranges for the player
  const pointMarkers = useMemo(
    () =>
      manualMarkers
        .filter((m): m is TimestampAnnotationItem => m.type === 'timestamp')
        .map((m) => ({ id: m.id, timestamp: m.timestamp, content: m.content })),
    [manualMarkers],
  );

  const frameRangesForPlayer = useMemo(
    () =>
      manualMarkers
        .filter((m): m is FrameAnnotationItem => m.type === 'frame')
        .map((m): TimelineFrameRange => ({
          id: m.id,
          timestampStart: m.timestampStart,
          timestampEnd: m.timestampEnd,
          content: m.content,
        })),
    [manualMarkers],
  );

  if (loading) {
    return (
      <div className="detail-page not-found">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="detail-page not-found">
        <h2>{error ?? 'Video not found'}</h2>
        <p>The video you're looking for doesn't exist or could not be loaded.</p>
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to videos
        </Link>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Back to videos
      </Link>

      {video.status === 'ready' && video.videoUrl ? (
        <VideoPlayer
          ref={playerRef}
          src={video.videoUrl}
          markers={pointMarkers}
          frameRanges={frameRangesForPlayer}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          rangeSelectMode={rangeSelectMode}
          onRangeSelected={handleRangeSelected}
        />
      ) : (
        <div className="player-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#fff', fontSize: '0.875rem' }}>
            {video.status === 'processing'
              ? 'This video is still processing…'
              : 'This video failed to process.'}
          </p>
        </div>
      )}

      <div className="detail-info">
        <h1 className="detail-title">{video.title}</h1>
        <div className="detail-meta">
          <span className="detail-meta-item">
            <Calendar size={14} />
            {formatDate(video.uploadDate)}
          </span>
          {video.duration > 0 && (
            <span className="detail-meta-item">
              <Clock size={14} />
              {formatDuration(video.duration)}
            </span>
          )}
          <span
            className={`status-badge status-badge--${video.status}`}
          >
            <span className={`status-dot status-dot--${video.status}`} />
            {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Annotation Panel */}
      {video.status === 'ready' && (
        <AnnotationPanel
          videoId={video.id}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          onMarkersChange={handleMarkersChange}
          isRangeSelectMode={rangeSelectMode}
          pendingRange={pendingRange}
          onStartRangeSelect={handleStartRangeSelect}
          onCancelRangeSelect={handleCancelRangeSelect}
        />
      )}
    </div>
  );
}
