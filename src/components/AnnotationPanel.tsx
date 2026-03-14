import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, Pencil, Trash2, Check, X, Layers, MessageSquare, ChevronDown, Sparkles, Tag, Film, Info, Search } from 'lucide-react';
import type { AutoAnnotationItem, AutoAnnotationsPaginated, ManualAnnotationItem, FrameAnnotationItem, VideoSummary } from '../api/videos';
import {
  fetchAutoAnnotations,
  createAutoAnnotation,
  patchAnnotation,
  deleteAnnotationById,
  updateAutoAnnotationInterval,
  fetchManualAnnotations,
  createManualAnnotation,
  createFrameAnnotation,
  fetchVideoSummary,
} from '../api/videos';
import { formatDuration } from '../utils/format';

type Tab = 'auto' | 'manual' | 'summary';

interface AnnotationPanelProps {
  videoId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** Called after manual annotations change so parent can sync timeline markers */
  onMarkersChange?: (manualAnnotations: ManualAnnotationItem[]) => void;
  /** True while the player is waiting for two timeline clicks to define a range */
  isRangeSelectMode?: boolean;
  /** Set after the user has clicked twice on the timeline — ready to enter content */
  pendingRange?: { start: number; end: number } | null;
  /** Activate range-select mode on the player */
  onStartRangeSelect?: () => void;
  /** Cancel range-select mode and clear any pending range */
  onCancelRangeSelect?: () => void;
}

export function AnnotationPanel({ videoId, currentTime, duration, onSeek, onMarkersChange, isRangeSelectMode = false, pendingRange, onStartRangeSelect, onCancelRangeSelect }: AnnotationPanelProps) {
  const [tab, setTab] = useState<Tab>('manual');

  // ── Manual annotations (Notes tab) ──
  const [manualAnnotations, setManualAnnotations] = useState<ManualAnnotationItem[]>([]);
  const [manualLoading, setManualLoading] = useState(true);

  // ── Auto annotations (Auto Frames tab) ──
  const [autoItems, setAutoItems] = useState<AutoAnnotationItem[]>([]);
  const [autoPage, setAutoPage] = useState(0); // 0 = not yet loaded
  const [autoTotalPages, setAutoTotalPages] = useState(1);
  const [autoTotal, setAutoTotal] = useState(0);
  const [autoInterval, setAutoInterval] = useState<number | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // ── Search state ──
  const [manualSearch, setManualSearch] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<ManualAnnotationItem[] | null>(null);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [autoSearch, setAutoSearch] = useState('');

  // ── Summary tab ──
  const [summary, setSummary] = useState<VideoSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // ── Note editing state ──
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const noteInputRef = useRef<HTMLInputElement>(null);

  // ── Frame annotation form state ──
  const [frameContent, setFrameContent] = useState('');
  const frameInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-frame editing state ──
  const [autoEditIndex, setAutoEditIndex] = useState<number | null>(null);
  const [autoEditContent, setAutoEditContent] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);

  // Fetch manual annotations on mount
  useEffect(() => {
    setManualLoading(true);
    fetchManualAnnotations(videoId)
      .then((items) => {
        setManualAnnotations(items);
        onMarkersChange?.(items);
      })
      .finally(() => setManualLoading(false));
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced manual search
  useEffect(() => {
    const trimmed = manualSearch.trim();
    if (!trimmed) {
      setManualSearchResults(null);
      setManualSearchLoading(false);
      return;
    }
    setManualSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await fetchManualAnnotations(videoId, trimmed);
        setManualSearchResults(results);
      } catch {
        setManualSearchResults(null);
      } finally {
        setManualSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [manualSearch, videoId]);

  // Load first page of auto-annotations when Auto Frames tab is opened
  useEffect(() => {
    if (tab === 'auto' && autoPage === 0) {
      loadAutoPage(1);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load summary when Summary tab first opened
  useEffect(() => {
    if (tab === 'summary' && !summaryLoaded && !summaryLoading) {
      setSummaryLoading(true);
      setSummaryError(null);
      fetchVideoSummary(videoId)
        .then((data) => {
          setSummary(data);
          setSummaryLoaded(true);
        })
        .catch(() => setSummaryError('Could not load summary.'))
        .finally(() => setSummaryLoading(false));
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAutoPage = useCallback(
    async (page: number, search?: string) => {
      setAutoLoading(true);
      try {
        const res: AutoAnnotationsPaginated = await fetchAutoAnnotations(videoId, page, 50, search);
        setAutoItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setAutoPage(res.page);
        setAutoTotalPages(res.totalPages);
        setAutoTotal(res.total);
        setAutoInterval(res.autoAnnotationInterval);
      } finally {
        setAutoLoading(false);
      }
    },
    [videoId],
  );

  // Debounced auto-frame search — reloads from page 1 whenever the term changes
  useEffect(() => {
    if (autoPage === 0) return; // auto tab not yet opened
    const timer = setTimeout(() => {
      loadAutoPage(1, autoSearch.trim() || undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [autoSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle interval change: call API then reload auto annotations from page 1
  const handleIntervalChange = useCallback(
    async (newInterval: number) => {
      if (newInterval === autoInterval) return;
      setAutoLoading(true);
      try {
        await updateAutoAnnotationInterval(videoId, newInterval);
        // Reset and reload from page 1
        setAutoItems([]);
        setAutoPage(0);
        const res = await fetchAutoAnnotations(videoId, 1, 50, autoSearch.trim() || undefined);
        setAutoItems(res.items);
        setAutoPage(res.page);
        setAutoTotalPages(res.totalPages);
        setAutoTotal(res.total);
        setAutoInterval(res.autoAnnotationInterval);
      } finally {
        setAutoLoading(false);
      }
    },
    [videoId, autoInterval, autoSearch],
  );

  // Focus note input when adding
  useEffect(() => {
    if (addingNote && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [addingNote]);

  // Focus frame content input when a range has been selected
  useEffect(() => {
    if (pendingRange && frameInputRef.current) {
      frameInputRef.current.focus();
    }
  }, [pendingRange]);

  // ── Manual note handlers ──

  const handleAddNote = useCallback(async () => {
    if (!newNoteText.trim()) return;
    const item = await createManualAnnotation(videoId, currentTime, newNoteText.trim());
    setManualAnnotations((prev) => {
      const updated = [...prev, item].sort((a, b) => {
        const aTime = a.type === 'timestamp' ? a.timestamp : a.timestampStart;
        const bTime = b.type === 'timestamp' ? b.timestamp : b.timestampStart;
        return aTime - bTime;
      });
      onMarkersChange?.(updated);
      return updated;
    });
    setManualSearchResults(null);
    setManualSearch('');
    setNewNoteText('');
    setAddingNote(false);
  }, [videoId, currentTime, newNoteText, onMarkersChange]);

  const handleUpdateNote = useCallback(
    async (annotationId: string) => {
      const res = await patchAnnotation(videoId, annotationId, editText.trim());
      setManualAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, content: res.content } : a)),
      );
      setManualSearchResults(null);
      setManualSearch('');
      setEditingId(null);
      setEditText('');
    },
    [videoId, editText],
  );

  const handleDelete = useCallback(
    async (annotationId: string) => {
      await deleteAnnotationById(videoId, annotationId);
      setManualAnnotations((prev) => {
        const updated = prev.filter((a) => a.id !== annotationId);
        onMarkersChange?.(updated);
        return updated;
      });
      setManualSearchResults(null);
      setManualSearch('');
    },
    [videoId, onMarkersChange],
  );

  const handleSaveFrame = useCallback(async () => {
    if (!frameContent.trim() || !pendingRange) return;
    const item = await createFrameAnnotation(videoId, pendingRange.start, pendingRange.end, frameContent.trim());
    setManualAnnotations((prev) => {
      const updated = [...prev, item].sort((a, b) => {
        const aTime = a.type === 'timestamp' ? a.timestamp : a.timestampStart;
        const bTime = b.type === 'timestamp' ? b.timestamp : b.timestampStart;
        return aTime - bTime;
      });
      onMarkersChange?.(updated);
      return updated;
    });
    setManualSearchResults(null);
    setManualSearch('');
    setFrameContent('');
    onCancelRangeSelect?.();
  }, [videoId, frameContent, pendingRange, onMarkersChange, onCancelRangeSelect]);

  const handleCancelFrame = useCallback(() => {
    setFrameContent('');
    onCancelRangeSelect?.();
  }, [onCancelRangeSelect]);

  const startEdit = useCallback((id: string, note: string) => {
    setEditingId(id);
    setEditText(note);
  }, []);

  // ── Auto-frame edit handlers ──

  const startAutoEdit = useCallback((index: number, item: AutoAnnotationItem) => {
    setAutoEditIndex(index);
    setAutoEditContent(item.content || item.note || '');
  }, []);

  const cancelAutoEdit = useCallback(() => {
    setAutoEditIndex(null);
    setAutoEditContent('');
  }, []);

  const handleAutoSave = useCallback(
    async (index: number) => {
      const item = autoItems[index];
      if (!item) return;
      setAutoSaving(true);
      try {
        if (item.id) {
          // Existing annotation — PATCH
          const res = await patchAnnotation(videoId, item.id, autoEditContent.trim());
          setAutoItems((prev) =>
            prev.map((it, i) =>
              i === index
                ? { ...it, content: res.content }
                : it,
            ),
          );
        } else {
          // New annotation (id was null) — POST
          const res = await createAutoAnnotation(videoId, {
            timestamp: item.timestamp,
            content: autoEditContent.trim(),
            note: autoEditContent.trim(),
          });
          setAutoItems((prev) =>
            prev.map((it, i) =>
              i === index
                ? { ...it, id: res.id, content: res.content, createdAt: res.created_at }
                : it,
            ),
          );
        }
        setAutoEditIndex(null);
        setAutoEditContent('');
      } finally {
        setAutoSaving(false);
      }
    },
    [videoId, autoItems, autoEditContent],
  );

  // ── Row renderers ──

  const renderFrameRow = (annotation: FrameAnnotationItem) => {
    const isActive =
      duration > 0 &&
      currentTime >= annotation.timestampStart &&
      currentTime <= annotation.timestampEnd;
    const isEditing = editingId === annotation.id;

    return (
      <div
        key={annotation.id}
        className={`annotation-row ${isActive ? 'annotation-row--active' : ''}`}
      >
        <div className="annotation-frame-timestamps">
          <button
            className="annotation-timestamp"
            onClick={() => onSeek(annotation.timestampStart)}
            title={`Jump to start: ${formatDuration(annotation.timestampStart)}`}
          >
            <Clock size={12} />
            {formatDuration(annotation.timestampStart)}
          </button>
          <span className="annotation-frame-dash">–</span>
          <button
            className="annotation-timestamp"
            onClick={() => onSeek(annotation.timestampEnd)}
            title={`Jump to end: ${formatDuration(annotation.timestampEnd)}`}
          >
            <Clock size={12} />
            {formatDuration(annotation.timestampEnd)}
          </button>
        </div>

        <div className="annotation-content">
          {isEditing ? (
            <div className="annotation-edit-row">
              <input
                className="annotation-edit-input"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateNote(annotation.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button className="annotation-action-btn" onClick={() => handleUpdateNote(annotation.id)} title="Save">
                <Check size={14} />
              </button>
              <button className="annotation-action-btn" onClick={() => setEditingId(null)} title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className="annotation-note">{annotation.content}</span>
              <div className="annotation-actions">
                <button className="annotation-action-btn" onClick={() => startEdit(annotation.id, annotation.content)} title="Edit">
                  <Pencil size={13} />
                </button>
                <button className="annotation-action-btn annotation-action-btn--danger" onClick={() => handleDelete(annotation.id)} title="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderManualRow = (annotation: ManualAnnotationItem) => {
    if (annotation.type === 'frame') return renderFrameRow(annotation);

    // timestamp annotation
    const isActive = duration > 0 && Math.abs(currentTime - annotation.timestamp) < 1;
    const isEditing = editingId === annotation.id;

    return (
      <div
        key={annotation.id}
        className={`annotation-row ${isActive ? 'annotation-row--active' : ''}`}
      >
        <button
          className="annotation-timestamp"
          onClick={() => onSeek(annotation.timestamp)}
          title="Jump to this timestamp"
        >
          <Clock size={12} />
          {formatDuration(annotation.timestamp)}
        </button>

        <div className="annotation-content">
          {isEditing ? (
            <div className="annotation-edit-row">
              <input
                className="annotation-edit-input"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateNote(annotation.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button className="annotation-action-btn" onClick={() => handleUpdateNote(annotation.id)} title="Save">
                <Check size={14} />
              </button>
              <button className="annotation-action-btn" onClick={() => setEditingId(null)} title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className="annotation-note">{annotation.content}</span>
              <div className="annotation-actions">
                <button className="annotation-action-btn" onClick={() => startEdit(annotation.id, annotation.content)} title="Edit note">
                  <Pencil size={13} />
                </button>
                <button className="annotation-action-btn annotation-action-btn--danger" onClick={() => handleDelete(annotation.id)} title="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAutoRow = (item: AutoAnnotationItem, index: number) => {
    const isActive =
      duration > 0 &&
      Math.abs(currentTime - item.timestamp) < (autoInterval ?? 1);
    const isEditing = autoEditIndex === index;

    return (
      <div
        key={item.id ?? `auto-${index}-${item.timestamp}`}
        className={`annotation-row ${isActive ? 'annotation-row--active' : ''}`}
      >
        <button
          className="annotation-timestamp"
          onClick={() => onSeek(item.timestamp)}
          title="Jump to this timestamp"
        >
          <Clock size={12} />
          {formatDuration(item.timestamp)}
        </button>

        <div className="annotation-content">
          {isEditing ? (
            <div className="annotation-edit-row">
              <input
                className="annotation-edit-input"
                value={autoEditContent}
                onChange={(e) => setAutoEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAutoSave(index);
                  if (e.key === 'Escape') cancelAutoEdit();
                }}
                placeholder="Add content…"
                autoFocus
              />
              <button
                className="annotation-action-btn"
                onClick={() => handleAutoSave(index)}
                title="Save"
                disabled={autoSaving}
              >
                <Check size={14} />
              </button>
              <button
                className="annotation-action-btn"
                onClick={cancelAutoEdit}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className="annotation-note">
                {item.content || item.note || (
                  <span className="annotation-note--empty">
                    Frame at {formatDuration(item.timestamp)}
                  </span>
                )}
              </span>
              <div className="annotation-actions">
                <button
                  className="annotation-action-btn"
                  onClick={() => startAutoEdit(index, item)}
                  title={item.content || item.note ? 'Edit content' : 'Add content'}
                >
                  <Pencil size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Render ──

  const autoHasMore = autoPage < autoTotalPages;
  const displayedManualAnnotations = manualSearchResults ?? manualAnnotations;

  return (
    <div className="annotation-panel">
      {/* Panel Header */}
      <div className="annotation-panel-header">
        <div className="annotation-tabs">
          <button
            className={`annotation-tab ${tab === 'manual' ? 'annotation-tab--active' : ''}`}
            onClick={() => setTab('manual')}
          >
            <MessageSquare size={14} />
            Notes
            {manualAnnotations.length > 0 && (
              <span className="annotation-tab-count">{manualAnnotations.length}</span>
            )}
          </button>
          <button
            className={`annotation-tab ${tab === 'auto' ? 'annotation-tab--active' : ''}`}
            onClick={() => setTab('auto')}
          >
            <Layers size={14} />
            Auto Frames
            {autoTotal > 0 && (
              <span className="annotation-tab-count">{autoTotal}</span>
            )}
          </button>
          <button
            className={`annotation-tab ${tab === 'summary' ? 'annotation-tab--active' : ''}`}
            onClick={() => setTab('summary')}
          >
            <Sparkles size={14} />
            Summary
          </button>
        </div>

        {tab === 'manual' && (
          <div className="annotation-header-actions">
            <button
              className="annotation-add-btn"
              onClick={() => setAddingNote(true)}
              title="Add note at current time"
              disabled={isRangeSelectMode || !!pendingRange}
            >
              <Plus size={14} />
              Add Note
            </button>
            <button
              className={`annotation-add-btn${isRangeSelectMode || pendingRange ? ' annotation-add-btn--active' : ''}`}
              onClick={onStartRangeSelect}
              title="Click twice on the timeline to create a frame annotation"
              disabled={isRangeSelectMode || !!pendingRange}
            >
              <Film size={14} />
              Add Frame
            </button>
          </div>
        )}

        {tab === 'auto' && (
          <div className="interval-selector">
            <span className="interval-selector-label">Interval:</span>
            <div className="interval-selector-btns">
              {[1, 5, 10].map((sec) => (
                <button
                  key={sec}
                  className={`interval-selector-btn ${autoInterval === sec ? 'interval-selector-btn--active' : ''}`}
                  onClick={() => handleIntervalChange(sec)}
                  disabled={autoLoading}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search bar — Notes and Auto Frames tabs */}
      {tab !== 'summary' && (
        <div className="annotation-search-bar">
          <Search size={13} className="annotation-search-icon" />
          <input
            className="annotation-search-input"
            placeholder={tab === 'manual' ? 'Search notes…' : 'Search frames…'}
            value={tab === 'manual' ? manualSearch : autoSearch}
            onChange={(e) =>
              tab === 'manual'
                ? setManualSearch(e.target.value)
                : setAutoSearch(e.target.value)
            }
          />
          {(tab === 'manual' ? manualSearch : autoSearch) && (
            <button
              className="annotation-search-clear"
              onClick={() => {
                if (tab === 'manual') {
                  setManualSearch('');
                  setManualSearchResults(null);
                } else {
                  setAutoSearch('');
                }
              }}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Range-select status banner */}
      {isRangeSelectMode && !pendingRange && (
        <div className="range-select-banner">
          <div className="range-select-banner-text">
            <Info size={14} />
            <span>Click once on the timeline to set <strong>start</strong>, click again for <strong>end</strong></span>
          </div>
          <button className="annotation-action-btn" onClick={onCancelRangeSelect} title="Cancel">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Add note inline */}
      {addingNote && (
        <div className="annotation-add-row">
          <span className="annotation-timestamp-static">
            <Clock size={12} />
            {formatDuration(currentTime)}
          </span>
          <input
            ref={noteInputRef}
            className="annotation-edit-input"
            placeholder="Type your note…"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNote();
              if (e.key === 'Escape') {
                setAddingNote(false);
                setNewNoteText('');
              }
            }}
          />
          <button
            className="annotation-action-btn"
            onClick={handleAddNote}
            title="Save"
            disabled={!newNoteText.trim()}
          >
            <Check size={14} />
          </button>
          <button
            className="annotation-action-btn"
            onClick={() => {
              setAddingNote(false);
              setNewNoteText('');
            }}
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Pending frame range form (after two timeline clicks) */}
      {pendingRange && (
        <div className="annotation-add-row annotation-add-row--frame">
          <div className="annotation-frame-timestamps">
            <button
              className="annotation-timestamp"
              onClick={() => onSeek(pendingRange.start)}
              title={`Jump to ${formatDuration(pendingRange.start)}`}
            >
              <Clock size={12} />
              {formatDuration(pendingRange.start)}
            </button>
            <span className="annotation-frame-dash">–</span>
            <button
              className="annotation-timestamp"
              onClick={() => onSeek(pendingRange.end)}
              title={`Jump to ${formatDuration(pendingRange.end)}`}
            >
              <Clock size={12} />
              {formatDuration(pendingRange.end)}
            </button>
          </div>
          <input
            ref={frameInputRef}
            className="annotation-edit-input"
            placeholder="Describe this segment…"
            value={frameContent}
            onChange={(e) => setFrameContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveFrame();
              if (e.key === 'Escape') handleCancelFrame();
            }}
          />
          <button
            className="annotation-action-btn"
            onClick={handleSaveFrame}
            title="Save frame"
            disabled={!frameContent.trim()}
          >
            <Check size={14} />
          </button>
          <button
            className="annotation-action-btn"
            onClick={handleCancelFrame}
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Annotation List */}
      <div className="annotation-list">
        {tab === 'manual' ? (
          manualLoading ? (
            <p className="annotation-empty">Loading notes…</p>
          ) : manualSearchLoading ? (
            <p className="annotation-empty">Searching…</p>
          ) : displayedManualAnnotations.length > 0 ? (
            displayedManualAnnotations.map(renderManualRow)
          ) : (
            <p className="annotation-empty">
              {manualSearch.trim()
                ? 'No results found.'
                : 'No notes yet. Pause the video and click "Add Note" to annotate.'}
            </p>
          )
        ) : tab === 'summary' ? (
          summaryLoading ? (
            <p className="annotation-empty">Loading summary…</p>
          ) : summaryError ? (
            <p className="annotation-empty">{summaryError}</p>
          ) : summary ? (
            <div className="summary-content">
              {/* TL;DR */}
              <div className="summary-section">
                <h4 className="summary-section-heading">
                  <Sparkles size={13} />
                  TL;DR
                </h4>
                <p className="summary-tldr">{summary.tldr}</p>
              </div>

              {/* Highlights */}
              {summary.highlights.length > 0 && (
                <div className="summary-section">
                  <h4 className="summary-section-heading">
                    <Clock size={13} />
                    Highlights
                  </h4>
                  <div className="summary-highlights">
                    {summary.highlights.map((h, i) => (
                      <div key={i} className="summary-highlight-card">
                        <button
                          className="summary-highlight-ts"
                          onClick={() => onSeek(h.timestamp)}
                          title={`Jump to ${h.timestamp_display}`}
                        >
                          {h.timestamp_display}
                        </button>
                        <div className="summary-highlight-body">
                          <span className="summary-highlight-title">{h.title}</span>
                          <span className="summary-highlight-short">{h.short}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {summary.keywords.length > 0 && (
                <div className="summary-section">
                  <h4 className="summary-section-heading">
                    <Tag size={13} />
                    Keywords
                  </h4>
                  <div className="summary-keywords">
                    {summary.keywords.map((kw, i) => (
                      <span key={i} className="summary-keyword">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="annotation-empty">No summary available for this video.</p>
          )
        ) : (
          <>
            {autoItems.length > 0
              ? autoItems.map(renderAutoRow)
              : !autoLoading && (
                  <p className="annotation-empty">
                    No auto-frame annotations. Frame extraction wasn't requested for this video.
                  </p>
                )}

            {autoLoading && (
              <p className="annotation-empty">Loading auto frames…</p>
            )}

            {autoHasMore && !autoLoading && (
              <button
                className="annotation-load-more"
                onClick={() => loadAutoPage(autoPage + 1, autoSearch.trim() || undefined)}
              >
                <ChevronDown size={14} />
                Load more ({autoItems.length} of {autoTotal})
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {tab === 'auto' && autoInterval !== null && autoItems.length > 0 && (
        <div className="annotation-footer">
          Frames every {autoInterval}s · showing {autoItems.length} of {autoTotal}
        </div>
      )}
    </div>
  );
}
