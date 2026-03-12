import type { Video } from '../types/video';
import { formatDuration, formatDate, formatFileSize } from '../utils/format';
import { Film } from 'lucide-react';

interface VideoCardProps {
  video: Video;
  onClick: () => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  return (
    <div className="video-card" onClick={onClick}>
      <div className="video-card-thumb">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt={video.title} className="thumb-img" />
        ) : (
          <Film size={36} className="thumb-icon" />
        )}
        {video.duration > 0 && (
          <span className="video-card-duration">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="video-card-body">
        <span className="video-card-title">{video.title}</span>
        <div className="video-card-meta">
          <span>{formatDate(video.uploadDate)}</span>
          <span
            className={`status-badge status-badge--${video.status}`}
          >
            <span className={`status-dot status-dot--${video.status}`} />
            {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
          </span>
        </div>
        {video.fileSize ? (
          <span className="video-card-size">{formatFileSize(video.fileSize)}</span>
        ) : null}
      </div>
    </div>
  );
}
