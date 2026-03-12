import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, Pencil, Trash2, Check, X, Layers, MessageSquare, ChevronDown } from 'lucide-react';
import type { Annotation } from '../types/video';
import type { AutoAnnotationItem, AutoAnnotationsPaginated } from '../api/videos';
import { fetchAutoAnnotations, saveAutoAnnotation, updateAutoAnnotationInterval } from '../api/videos';
import { addAnnotation, updateAnnotationNote, deleteAnnotation, fetchAnnotations } from '../data/mockAnnotations';
import { formatDuration } from '../utils/format';

type Tab = 'auto' | 'manual';

interface AnnotationPanelProps {
  videoId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** Called after manual annotations change (add/delete) so parent can sync timeline markers */
  onMarkersChange?: (manualAnnotations: Annotation[]) => void;
}

export function AnnotationPanel({ videoId, currentTime, duration, onSeek, onMarkersChange }: AnnotationPanelProps) {
  const [tab, setTab] = useState<Tab>('manual');

  // ── Manual annotations (Notes tab) ──
  const [manualAnnotations, setManualAnnotations] = useState<Annotation[]>([]);
  const [manualLoading, setManualLoading] = useState(true);

  // ── Auto annotations (Auto Frames tab) ──
  const [autoItems, setAutoItems] = useState<AutoAnnotationItem[]>([]);
  const [autoPage, setAutoPage] = useState(0); // 0 = not yet loaded
  const [autoTotalPages, setAutoTotalPages] = useState(1);
  const [autoTotal, setAutoTotal] = useState(0);
  const [autoInterval, setAutoInterval] = useState<number | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

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
    fetchAnnotations(videoId).then((result) => {
      const manual = result.annotations.filter((a) => a.type === 'manual');
      setManualAnnotations(manual);
      onMarkersChange?.(manual);
      setManualLoading(false);
    });
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load first page of auto-annotations when Auto Frames tab is opened
  useEffect(() => {
    if (tab === 'auto' && autoPage === 0) {
      loadAutoPage(1);
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
    const annotation = await addAnnotation(videoId, currentTime, newNoteText.trim());
    setManualAnnotations((prev) => {
      const updated = [...prev, annotation].sort((a, b) => a.timestamp - b.timestamp);
      onMarkersChange?.(updated);
      return updated;
    });
    setNewNoteText('');
    setAddingNote(false);
  }, [videoId, currentTime, newNoteText, onMarkersChange]);

  const handleUpdateNote = useCallback(
    async (annotationId: string) => {
      await updateAnnotationNote(annotationId, editText.trim());
      setManualAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, note: editText.trim() } : a)),
      );
      setEditingId(null);
      setEditText('');
    },
    [editText],
  );

  const handleDelete = useCallback(
    async (annotationId: string) => {
      await deleteAnnotation(annotationId);
      setManualAnnotations((prev) => {
        const updated = prev.filter((a) => a.id !== annotationId);
        onMarkersChange?.(updated);
        return updated;
      });
    },
    [onMarkersChange],
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
        const res = await saveAutoAnnotation(videoId, {
          timestamp: item.timestamp,
          content: autoEditContent.trim(),
          note: autoEditContent.trim(),
        });
        // Update the item in-place with the returned id and content
        setAutoItems((prev) =>
          prev.map((it, i) =>
            i === index
              ? { ...it, id: res.id, content: res.content, createdAt: res.created_at }
              : it,
          ),
        );
        setAutoEditIndex(null);
        setAutoEditContent('');
      } finally {
        setAutoSaving(false);
      }
    },
    [videoId, autoItems, autoEditContent],
  );

  // ── Row renderers ──

  const renderManualRow = (annotation: Annotation) => {
    const isActive = duration > 0 && Math.abs(currentTime - annotation.timestamp) < 1;
    const isEditing = editingId === annotation.id;

    return (
      <div
        key={annotation.id ?? `m-${annotation.timestamp}`}
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
          {isEditing && annotation.id ? (
            <div className="annotation-edit-row">
              <input
                className="annotation-edit-input"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateNote(annotation.id!);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button className="annotation-action-btn" onClick={() => handleUpdateNote(annotation.id!)} title="Save">
                <Check size={14} />
              </button>
              <button className="annotation-action-btn" onClick={() => setEditingId(null)} title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className="annotation-note">{annotation.note}</span>
              <div className="annotation-actions">
                {annotation.id && (
                  <button className="annotation-action-btn" onClick={() => startEdit(annotation.id!, annotation.note)} title="Edit note">
                    <Pencil size={13} />
                  </button>
                )}
                {annotation.id && (
                  <button className="annotation-action-btn annotation-action-btn--danger" onClick={() => handleDelete(annotation.id!)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
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
      {tab === 'auto' && autoInterval && autoItems.length > 0 && (
        <div className="annotation-footer">
          Frames every {autoInterval}s · showing {autoItems.length} of {autoTotal}
        </div>
      )}
    </div>
  );
}
