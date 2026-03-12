import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { fetchVideos } from '../api/videos';
import { VideoCard } from '../components/VideoCard';
import { UploadModal } from '../components/UploadModal';
import type { Video } from '../types/video';
import '../App.css';

const VIDEOS_PER_PAGE = 5;

export function VideoListPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  // Fetch videos from backend
  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVideos();
      setVideos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const totalPages = Math.max(1, Math.ceil(videos.length / VIDEOS_PER_PAGE));

  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * VIDEOS_PER_PAGE;
    return videos.slice(start, start + VIDEOS_PER_PAGE);
  }, [videos, currentPage]);

  const handleUploadComplete = useCallback(
    (video: Video) => {
      // Optimistically prepend, then refresh from backend
      setVideos((prev) => [video, ...prev]);
      setShowUpload(false);
      setCurrentPage(1);
      // Refresh list from server to get canonical data
      loadVideos();
    },
    [loadVideos],
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">My Videos</h1>
        <button className="upload-btn" onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          Upload Video
        </button>
      </header>

      {loading ? (
        <div className="empty-state">
          <Loader size={32} className="empty-state-icon spinner" />
          <h3>Loading videos…</h3>
        </div>
      ) : error ? (
        <div className="empty-state">
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <button className="btn-secondary" style={{ marginTop: 12 }} onClick={loadVideos}>
            Retry
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Film size={48} className="empty-state-icon" />
          <h3>No videos yet</h3>
          <p>Upload your first video to get started.</p>
        </div>
      ) : (
        <>
          <div className="video-list">
            {paginatedVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onClick={() => navigate(`/video/${video.id}`)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-arrow"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`pagination-btn ${page === currentPage ? 'pagination-btn--active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="pagination-arrow"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
