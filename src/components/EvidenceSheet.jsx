import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.6; // px per ms

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Frosted-glass evidence sheet: slides up over a dimmed (still visible)
 * constellation. Dismiss by clicking outside, swiping down, or the close
 * control. Escape works too, and focus stays inside while it is open.
 */
export default function EvidenceSheet({
  open,
  kind = 'branch',
  branch,
  skill,
  profile,
  onClose,
  onEditProfile,
  onStartOver,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef({ active: false, startY: 0, startTime: 0, dy: 0 });
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  /** Play a short slide-out before unmounting (skipped for reduced motion). */
  const requestClose = useCallback(() => {
    if (closing) return;
    if (reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [closing, onClose, reducedMotion]);

  // Escape to dismiss + focus management while open.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;

    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus?.({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (node) => !node.hasAttribute('disabled')
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstNode = focusables[0];
      const lastNode = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.({ preventScroll: true });
      }
    };
  }, [open, requestClose]);

  if (!open) return null;

  const endDrag = () => {
    const { dy, startTime } = dragRef.current;
    const elapsed = Math.max(1, Date.now() - startTime);
    const fast = dy / elapsed > DISMISS_VELOCITY;
    dragRef.current.active = false;
    setDragging(false);
    if (dy > DISMISS_DISTANCE || fast) {
      requestClose();
    } else {
      setDragY(0);
    }
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    dragRef.current = {
      active: true,
      startY: event.clientY,
      startTime: Date.now(),
      dy: 0,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current.active) return;
    const dy = Math.max(0, event.clientY - dragRef.current.startY);
    dragRef.current.dy = dy;
    setDragY(dy);
  };

  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    endDrag();
  };

  const isProfile = kind === 'profile';
  const hasEvidence = !!branch?.hasEvidence || (branch?.n ?? 0) > 0;

  return (
    <div className="sheet-root">
      <div
        className={`sheet-backdrop${closing ? ' is-closing' : ''}`}
        onClick={requestClose}
        aria-hidden="true"
      />

      {/* Outer node carries the drag offset; the panel animates in. */}
      <div
        className={`sheet${dragging ? ' is-dragging' : ''}${closing ? ' is-closing' : ''}`}
        style={closing ? undefined : { transform: `translate3d(0, ${dragY}px, 0)` }}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
      >
        <div className="sheet__panel">
          <div
            className="sheet__grabzone"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="sheet__handle" aria-hidden="true" />
          </div>

          <button
            type="button"
            className="sheet__close"
            onClick={requestClose}
            aria-label="Close"
          >
            <span aria-hidden="true">×</span>
          </button>

          {isProfile ? (
            <div className="sheet__body">
              <p className="sheet__eyebrow">Where you&rsquo;re starting from</p>
              <h2 className="sheet__title" id="sheet-title">
                {profile.role}
              </h2>
              <p className="sheet__meta">
                {profile.experience === null || profile.experience === undefined
                  ? 'Experience length not specified'
                  : `${profile.experience} ${
                      Number(profile.experience) === 1 ? 'year' : 'years'
                    } of experience`}
              </p>
              <div className="sheet__chips">
                {(profile.skills || []).map((item) => (
                  <span className="chip chip--static" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <p className="sheet__hint">
                Tap a satellite around your star to see where people like you have
                actually moved after learning that skill.
              </p>
              <div className="sheet__actions">
                <button type="button" className="ghost-button" onClick={onEditProfile}>
                  Edit profile
                </button>
                {onStartOver && (
                  <button type="button" className="ghost-button" onClick={onStartOver}>
                    Start over
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="sheet__body">
              <p className="sheet__eyebrow">
                {skill ? `After learning ${skill}` : 'Observed transitions'}
              </p>
              <h2 className="sheet__title" id="sheet-title">
                {branch?.occupation}
              </h2>

              {hasEvidence ? (
                <>
                  <p className="sheet__stat">
                    <strong>{branch.share}%</strong> observed transition share — based
                    on <strong>{branch.n.toLocaleString()}</strong>{' '}
                    {branch.n === 1 ? 'real trajectory' : 'real trajectories'}
                  </p>
                  {branch.years ? (
                    <p className="sheet__meta">
                      Typical time to transition: ~{branch.years} yrs
                    </p>
                  ) : (
                    <p className="sheet__meta">
                      Typical transition time: not recorded in this sample
                    </p>
                  )}
                  {branch.p25Years != null && branch.p75Years != null && (
                    <p className="sheet__meta">
                      Typical range: {branch.p25Years}–{branch.p75Years} years
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="sheet__stat sheet__stat--dim">
                    Limited evidence for this path
                  </p>
                  <p className="sheet__meta">
                    No trajectories into this occupation were recorded for this
                    starting point, so we can&rsquo;t show a share or a timeframe.
                  </p>
                </>
              )}

              <p className="sheet__disclaimer">
                Reflects historical movement patterns, not a prediction for any
                individual.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
