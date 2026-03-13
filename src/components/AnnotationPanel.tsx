import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, Pencil, Trash2, Check, X, Layers, MessageSquare, ChevronDown, Sparkles, Tag } from 'lucide-react';
import type { AutoAnnotationItem, AutoAnnotationsPaginated, ManualAnnotationItem, VideoSummary } from '../api/videos';
import {
  fetchAutoAnnotations,
  createAutoAnnotation,
  patchAnnotation,
  deleteAnnotationById,
  updateAutoAnnotationInterval,
  fetchManualAnnotations,
  createManualAnnotation,
  fetchVideoSummary,
} from '../api/videos';
import { formatDuration } from '../utils/format';

type Tab = 'auto' | 'manual' | 'summary';

interface AnnotationPanelProps {
  videoId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** Called after manual annotations change (add/delete) so parent can sync timeline markers */
  onMarkersChange?: (manualAnnotations: ManualAnnotationItem[]) => void;
}

export function AnnotationPanel({ videoId, currentTime, duration, onSeek, onMarkersChange }: AnnotationPanelProps) {
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
    async (page: number) => {
      setAutoLoading(true);
      try {
        const res: AutoAnnotationsPaginated = await fetchAutoAnnotations(videoId, page, 50);
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
        const res = await fetchAutoAnnotations(videoId, 1, 50);
        setAutoItems(res.items);
        setAutoPage(res.page);
        setAutoTotalPages(res.totalPages);
        setAutoTotal(res.total);
        setAutoInterval(res.autoAnnotationInterval);
      } finally {
        setAutoLoading(false);
      }
    },
    [videoId, autoInterval],
  );

  // Focus note input when adding
  useEffect(() => {
    if (addingNote && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [addingNote]);

  // ── Manual note handlers ──

  const handleAddNote = useCallback(async () => {
    if (!newNoteText.trim()) return;
    const item = await createManualAnnotation(videoId, currentTime, newNoteText.trim());
    setManualAnnotations((prev) => {
      const updated = [...prev, item].sort((a, b) => a.timestamp - b.timestamp);
      onMarkersChange?.(updated);
      return updated;
    });
    setNewNoteText('');
    setAddingNote(false);
  }, [videoId, currentTime, newNoteText, onMarkersChange]);

  const handleUpdateNote = useCallback(
    async (annotationId: string) => {
      const res = await patchAnnotation(videoId, annotationId, editText.trim());
      setManualAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, content: res.content } : a)),
      );
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
    },
    [videoId, onMarkersChange],
  );

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

  const renderManualRow = (annotation: ManualAnnotationItem) => {
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
          <button
            className="annotation-add-btn"
            onClick={() => setAddingNote(true)}
            title="Add note at current time"
          >
            <Plus size={14} />
            Add Note
          </button>
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

      {/* Annotation List */}
      <div className="annotation-list">
        {tab === 'manual' ? (
          manualLoading ? (
            <p className="annotation-empty">Loading notes…</p>
          ) : manualAnnotations.length > 0 ? (
            manualAnnotations.map(renderManualRow)
          ) : (
            <p className="annotation-empty">
              No notes yet. Pause the video and click "Add Note" to annotate.
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
                onClick={() => loadAutoPage(autoPage + 1)}
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
