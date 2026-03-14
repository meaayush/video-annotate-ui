import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { formatDuration } from '../utils/format';

/** Minimal shape needed to render timeline markers */
export interface TimelineMarker {
  id: string;
  timestamp: number;
  content: string;
}

/** A frame (range) annotation to render as an orange bar on the timeline */
export interface TimelineFrameRange {
  id: string;
  timestampStart: number;
  timestampEnd: number;
  content: string;
}

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface VideoPlayerProps {
  src: string;
  /** Point (timestamp) markers to show as amber dots on the timeline */
  markers?: TimelineMarker[];
  /** Frame (range) annotations to show as orange bars on the timeline */
  frameRanges?: TimelineFrameRange[];
  /** Called on every time update with currentTime */
  onTimeUpdate?: (time: number) => void;
  /** Called when duration is known */
  onDurationChange?: (duration: number) => void;
  /** When true, two clicks on the timeline define a range instead of seeking */
  rangeSelectMode?: boolean;
  /** Called with (start, end) after two clicks in range-select mode */
  onRangeSelected?: (start: number, end: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, markers = [], frameRanges = [], onTimeUpdate, onDurationChange, rangeSelectMode = false, onRangeSelected }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  // Tracks the first click timestamp while in range-select mode
  const [rangeFirstClick, setRangeFirstClick] = useState<number | null>(null);

  // Reset first-click state whenever range-select mode is turned off
  useEffect(() => {
    if (!rangeSelectMode) setRangeFirstClick(null);
  }, [rangeSelectMode]);

  // Expose seek/time methods to parent
  useImperativeHandle(ref, () => ({
    seekTo(time: number) {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(time, v.duration || 0));
      setCurrentTime(v.currentTime);
    },
    getCurrentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
    getDuration() {
      return videoRef.current?.duration ?? 0;
    },
  }));

  // Sync video state
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTime = () => {
      if (!seeking) {
        setCurrentTime(v.currentTime);
        onTimeUpdate?.(v.currentTime);
      }
    };
    const onDur = () => {
      setDuration(v.duration || 0);
      onDurationChange?.(v.duration || 0);
    };
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onEnded = () => setPlaying(false);

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('progress', onProgress);
    v.addEventListener('ended', onEnded);

    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('progress', onProgress);
      v.removeEventListener('ended', onEnded);
    };
  }, [seeking, onTimeUpdate, onDurationChange]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.currentTime + seconds, v.duration));
  }, []);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || !videoRef.current) return;
      const fraction = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = fraction * duration;
      setCurrentTime(fraction * duration);
    },
    [duration],
  );

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const clickTime = fraction * duration;

      if (rangeSelectMode) {
        // First click → record start; second click → emit range
        if (rangeFirstClick === null) {
          setRangeFirstClick(clickTime);
        } else {
          const start = Math.min(rangeFirstClick, clickTime);
          const end = Math.max(rangeFirstClick, clickTime);
          setRangeFirstClick(null);
          onRangeSelected?.(start, end);
        }
        return;
      }

      if (!videoRef.current) return;
      setSeeking(true);
      handleTimelineClick(e);

      const onMouseMove = (ev: MouseEvent) => {
        const r = timelineRef.current?.getBoundingClientRect();
        if (!r || !videoRef.current) return;
        const f = Math.max(
          0,
          Math.min(1, (ev.clientX - r.left) / r.width),
        );
        videoRef.current.currentTime = f * duration;
        setCurrentTime(f * duration);
      };

      const onMouseUp = () => {
        setSeeking(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [duration, handleTimelineClick, rangeSelectMode, rangeFirstClick, onRangeSelected],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      setMuted(val === 0);
      if (videoRef.current) videoRef.current.volume = val;
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (muted) {
      v.muted = false;
      setMuted(false);
    } else {
      v.muted = true;
      setMuted(true);
    }
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    const wrapper = videoRef.current?.parentElement;
    if (!wrapper) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen();
    }
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="player-wrapper">
      <video ref={videoRef} src={src} onClick={togglePlay} preload="metadata" />

      <div className="player-controls">
        {/* Timeline */}
        <div
          className={`timeline${rangeSelectMode ? ' timeline--range-select' : ''}`}
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
        >
          <div
            className="timeline-buffer"
            style={{ width: `${bufferProgress}%` }}
          />
          <div
            className="timeline-progress"
            style={{ width: `${progress}%` }}
          >
            <div className="timeline-thumb" />
          </div>
          {/* Frame range annotations — orange bars */}
          {duration > 0 &&
            frameRanges.map((fr) => (
              <div
                key={fr.id}
                className="timeline-frame-range"
                style={{
                  left: `${(fr.timestampStart / duration) * 100}%`,
                  width: `${Math.max(0.5, ((fr.timestampEnd - fr.timestampStart) / duration) * 100)}%`,
                }}
                title={fr.content || `${formatDuration(fr.timestampStart)} – ${formatDuration(fr.timestampEnd)}`}
              />
            ))}
          {/* Manual annotation point markers */}
          {duration > 0 &&
            markers.map((m) => (
              <div
                key={m.id}
                className="timeline-marker"
                style={{ left: `${(m.timestamp / duration) * 100}%` }}
                title={m.content || `Note at ${formatDuration(m.timestamp)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (v) {
                    v.currentTime = m.timestamp;
                    setCurrentTime(m.timestamp);
                  }
                }}
              />
            ))}
          {/* Range-select first-click indicator */}
          {rangeFirstClick !== null && duration > 0 && (
            <div
              className="timeline-range-start"
              style={{ left: `${(rangeFirstClick / duration) * 100}%` }}
            />
          )}
        </div>

        {/* Controls Row */}
        <div className="controls-row">
          <div className="controls-left">
            <button className="control-btn" onClick={() => skip(-10)} title="Back 10s">
              <SkipBack size={18} />
            </button>
            <button className="control-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button className="control-btn" onClick={() => skip(10)} title="Forward 10s">
              <SkipForward size={18} />
            </button>

            <span className="time-display">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="controls-right">
            <div className="volume-group">
              <button className="control-btn" onClick={toggleMute}>
                {muted || volume === 0 ? (
                  <VolumeX size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>
            <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
