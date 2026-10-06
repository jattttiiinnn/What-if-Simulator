import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The 3D camera for the constellation sky.
 *
 * The whole sky is one plane with `transform-style: preserve-3d`; this hook
 * drives its `rotateX` / `rotateY` / `scale` transform every animation frame
 * from three inputs that add together:
 *
 *   - manual   the user's drag (clamped, and it stays put when released)
 *   - pointer  a subtle cursor parallax so the sky breathes as you move
 *   - idle     a slow drift once nobody has touched anything for a while
 *
 * Everything is written straight to the DOM node inside a single rAF loop,
 * so orbiting never triggers a React render — the reveal, the sheet and the
 * data fetching all keep their own state untouched.
 */

export const SKY_BASE_TILT = 10;

const LIMITS = {
  yaw: 30,
  tiltMin: -2,
  tiltMax: 34,
  zoomMin: 0.72,
  zoomMax: 1.35,
};

const MANUAL_YAW = 22; // clamp on the drag contribution alone
const DRAG_YAW = 0.24; // deg of yaw per px dragged
const DRAG_TILT = 0.24; // deg of tilt per px dragged
const PARALLAX_YAW = 6;
const PARALLAX_TILT = -4;
const IDLE_YAW = 4;
const IDLE_TILT = 2.4;
const EASE = 0.09;
const IDLE_AFTER_MS = 1800;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function useSky3D({ containerRef, planeRef, reducedMotion }) {
  // Inputs, all in refs: none of these should re-render the tree.
  const manual = useRef({ yaw: 0, tilt: 0 });
  const pointer = useRef({ yaw: 0, tilt: 0 });
  const zoom = useRef({ target: 1, current: 1 });
  const current = useRef({ yaw: 0, tilt: SKY_BASE_TILT });
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  const moved = useRef(0);
  const suppressClick = useRef(false);
  const lastInteraction = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  /** Mark "the user just did something" so the idle drift backs off. */
  const touch = useCallback(() => {
    lastInteraction.current = performance.now();
  }, []);

  const reset = useCallback(() => {
    manual.current = { yaw: 0, tilt: 0 };
    pointer.current = { yaw: 0, tilt: 0 };
    zoom.current.target = 1;
    touch();
  }, [touch]);

  const zoomBy = useCallback(
    (factor) => {
      zoom.current.target = clamp(
        zoom.current.target * factor,
        LIMITS.zoomMin,
        LIMITS.zoomMax
      );
      touch();
    },
    [touch]
  );

  useEffect(() => {
    const container = containerRef.current;
    const plane = planeRef.current;
    if (!container || !plane) return undefined;

    lastInteraction.current = performance.now();
    const startedAt = performance.now();
    let frame = 0;

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      // Never hijack a drag that starts on the sheet, the controls or a notice.
      if (
        event.target?.closest?.(
          '.sheet-root, .sky-controls, .legend, .stage-notice, .branch-note'
        )
      ) {
        return;
      }
      drag.current = { active: true, lastX: event.clientX, lastY: event.clientY };
      moved.current = 0;
      touch();
    };

    const onPointerMove = (event) => {
      if (drag.current.active) {
        const dx = event.clientX - drag.current.lastX;
        const dy = event.clientY - drag.current.lastY;
        drag.current.lastX = event.clientX;
        drag.current.lastY = event.clientY;
        const travel = Math.abs(dx) + Math.abs(dy);
        if (travel > 0) {
          manual.current.yaw = clamp(
            manual.current.yaw + dx * DRAG_YAW,
            -MANUAL_YAW,
            MANUAL_YAW
          );
          manual.current.tilt = clamp(
            manual.current.tilt - dy * DRAG_TILT,
            LIMITS.tiltMin - SKY_BASE_TILT,
            LIMITS.tiltMax - SKY_BASE_TILT
          );
          moved.current += travel;
          if (moved.current > 5) setIsDragging(true);
          touch();
        }
        return;
      }

      // Cursor parallax: only while nothing is being dragged.
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.current.yaw =
        ((event.clientX - rect.left) / rect.width - 0.5) * 2 * PARALLAX_YAW;
      pointer.current.tilt =
        ((event.clientY - rect.top) / rect.height - 0.5) * 2 * PARALLAX_TILT;
    };

    const endDrag = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      setIsDragging(false);
      if (moved.current > 6) {
        // A real orbit gesture, not a tap: swallow the click it would fire.
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 140);
      }
    };

    const onPointerLeave = () => {
      if (drag.current.active) return;
      pointer.current = { yaw: 0, tilt: 0 };
    };

    const onClickCapture = (event) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    };

    const onWheel = (event) => {
      event.preventDefault();
      zoom.current.target = clamp(
        zoom.current.target * (1 - event.deltaY * 0.0012),
        LIMITS.zoomMin,
        LIMITS.zoomMax
      );
      touch();
    };

    const loop = (now) => {
      const idleActive =
        !reducedMotion &&
        !drag.current.active &&
        now - lastInteraction.current > IDLE_AFTER_MS;
      const elapsed = now - startedAt;
      const idleYaw = idleActive ? Math.sin(elapsed * 0.00042) * IDLE_YAW : 0;
      const idleTilt = idleActive ? Math.cos(elapsed * 0.00033) * IDLE_TILT : 0;

      const targetYaw = clamp(
        manual.current.yaw + pointer.current.yaw + idleYaw,
        -LIMITS.yaw,
        LIMITS.yaw
      );
      const targetTilt = clamp(
        SKY_BASE_TILT + manual.current.tilt + pointer.current.tilt + idleTilt,
        LIMITS.tiltMin,
        LIMITS.tiltMax
      );

      const c = current.current;
      c.yaw += (targetYaw - c.yaw) * EASE;
      c.tilt += (targetTilt - c.tilt) * EASE;
      zoom.current.current += (zoom.current.target - zoom.current.current) * EASE;

      plane.style.transform =
        `rotateX(${c.tilt.toFixed(3)}deg) ` +
        `rotateY(${c.yaw.toFixed(3)}deg) ` +
        `scale(${zoom.current.current.toFixed(4)})`;

      frame = window.requestAnimationFrame(loop);
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('click', onClickCapture, true);
    container.addEventListener('wheel', onWheel, { passive: false });
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('click', onClickCapture, true);
      container.removeEventListener('wheel', onWheel);
    };
  }, [containerRef, planeRef, reducedMotion, touch]);

  return { isDragging, reset, zoomBy };
}
