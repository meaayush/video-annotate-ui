import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Link as LinkIcon } from 'lucide-react';
import type { Video } from '../types/video';
import {
  uploadVideoByUrl,
  getSignedUploadUrl,
  uploadFileToS3,
  confirmUpload,
} from '../api/videos';
import { formatFileSize } from '../utils/format';

interface UploadModalProps {
  onClose: () => void;
  onUploadComplete: (video: Video) => void;
}

type Tab = 'file' | 'url';

export function UploadModal({ onClose, onUploadComplete }: UploadModalProps) {
  const [tab, setTab] = useState<Tab>('file');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [frameInterval, setFrameInterval] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<ReturnType<typeof setInterval>>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
      abortUploadRef.current?.();
    };
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  }, [title]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    },
    [title],
  );

  const handleUpload = useCallback(async () => {
    setUploading(true);
    setProgress(0);
    setUploadError(null);

    if (tab === 'url') {
      // Real API call for URL upload
      try {
        const res = await uploadVideoByUrl({
          title: title.trim(),
          url: url.trim(),
          auto_annotation_interval: frameInterval,
        });

        const newVideo: Video = {
          id: res.video_id,
          title: title.trim(),
          uploadDate: new Date().toISOString(),
          duration: 0,
          status: 'processing',
          thumbnailUrl: '',
        };
        onUploadComplete(newVideo);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
        setUploading(false);
      }
    } else if (selectedFile) {
      // Real 3-step file upload: signed-url → S3 PUT → confirm
      try {
        const contentType = selectedFile.type || 'video/mp4';

        // Step 1: get a presigned upload URL from the backend
        const { video_id, signed_url, s3_key } = await getSignedUploadUrl({
          title: title.trim(),
          content_type: contentType,
          auto_annotation_interval: frameInterval,
        });

        // Step 2: upload the file directly to S3 (with real progress)
        const { promise, abort } = uploadFileToS3(
          signed_url,
          selectedFile,
          contentType,
          (percent) => setProgress(percent),
        );
        abortUploadRef.current = abort;
        await promise;
        abortUploadRef.current = null;

        // Step 3: tell the backend the upload is complete
        await confirmUpload({ video_id, s3_key });

        const newVideo: Video = {
          id: video_id,
          title: title.trim(),
          uploadDate: new Date().toISOString(),
          duration: 0,
          status: 'processing',
          thumbnailUrl: '',
          fileSize: selectedFile.size,
        };
        onUploadComplete(newVideo);
      } catch (err) {
        // Don't show error if the user just closed the modal (abort)
        if ((err as Error).message !== 'Upload cancelled') {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
        }
        setUploading(false);
      }
    }
  }, [title, tab, url, selectedFile, frameInterval, onUploadComplete]);

  const canSubmit =
    !uploading &&
    title.trim() !== '' &&
    (tab === 'file' ? selectedFile !== null : url.trim() !== '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Upload Video</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${tab === 'file' ? 'tab--active' : ''}`}
              onClick={() => setTab('file')}
            >
              <Upload size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Local File
            </button>
            <button
              className={`tab ${tab === 'url' ? 'tab--active' : ''}`}
              onClick={() => setTab('url')}
            >
              <LinkIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              From URL
            </button>
          </div>

          {tab === 'file' ? (
            <>
              {/* Drop Zone */}
              <div
                className={`drop-zone ${dragActive ? 'drop-zone--active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} className="drop-zone-icon" />
                <p className="drop-zone-text">
                  {selectedFile
                    ? selectedFile.name
                    : 'Drag & drop your video here, or click to browse'}
                </p>
                <p className="drop-zone-hint">
                  Supports large files (several GB) • MP4, MOV, AVI, MKV
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />

              {selectedFile && (
                <div className="upload-progress" style={{ marginTop: 12 }}>
                  <div className="upload-file-info">
                    <span className="upload-file-name">{selectedFile.name}</span>
                    <span className="upload-file-size">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="url-input-group">
              <label>Video URL</label>
              <input
                type="url"
                className="url-input"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="url-hint">
                Paste a direct link or public storage URL (S3, GCS, Azure Blob, etc.)
              </p>
            </div>
          )}

          {/* Title */}
          <div className="title-input-group">
            <label>Title</label>
            <input
              type="text"
              className="url-input"
              placeholder="Give your video a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Frame Interval Annotation */}
          <div className="annotation-group">
            <label>Automatic Frame Annotation</label>
            <p className="annotation-hint">
              Extract frames at a fixed interval for automatic annotation
            </p>
            <div className="interval-options">
              {[1, 5, 10].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`interval-btn ${frameInterval === sec ? 'interval-btn--active' : ''}`}
                  onClick={() => setFrameInterval(frameInterval === sec ? null : sec)}
                >
                  {sec}s
                </button>
              ))}
            </div>
            {frameInterval && (
              <p className="annotation-selected">
                Frames will be extracted every {frameInterval} second{frameInterval > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Upload Progress Bar */}
          {uploading && tab === 'file' && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="upload-status-text">
                {progress < 100
                  ? `Uploading to storage… ${Math.round(progress)}%`
                  : 'Confirming with server…'}
              </p>
            </div>
          )}

          {uploading && tab === 'url' && !uploadError && (
            <div className="upload-progress">
              <p className="upload-status-text">Submitting URL to server…</p>
            </div>
          )}

          {uploadError && (
            <div className="upload-progress">
              <p className="upload-status-text" style={{ color: 'var(--danger)' }}>
                {uploadError}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={handleUpload}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
