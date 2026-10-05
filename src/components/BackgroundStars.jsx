import { useEffect, useMemo, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

/**
 * Static starfield texture behind everything.
 * Generated once per module load (not per render, not per re-layout) and
 * split into three depth layers so a cursor can parallax them subtly.
 */
const STAR_COUNT = 74;
const LAYERS = [
  { depth: 5, className: 'is-far' },
  { depth: 10, className: 'is-mid' },
  { depth: 17, className: 'is-near' },
];

function createField() {
  return Array.from({ length: STAR_COUNT }, (_, index) => {
    const layer = index % LAYERS.length;
    const drift = LAYERS[layer].depth;
    return {
      id: `bg-${index}`,
      layer,
      left: `${(Math.random() * 100).toFixed(3)}%`,
      top: `${(Math.random() * 100).toFixed(3)}%`,
      size: +(0.8 + Math.random() * (layer === 2 ? 2.1 : 1.4)).toFixed(2),
      opacity: +(0.18 + Math.random() * 0.42).toFixed(3),
      duration: +(2.6 + Math.random() * 5.4).toFixed(2),
      delay: +(-Math.random() * 6).toFixed(2),
      drift,
    };
  });
}

const STAR_FIELD = createField();

export default function BackgroundStars({ reducedMotion: reducedProp }) {
  const prefersReduced = usePrefersReducedMotion();
  const reducedMotion = reducedProp ?? prefersReduced;
  const parallaxRef = useRef(null);
  const frameRef = useRef(0);
  const targetRef = useRef({ x: 0, y: 0 });

  const layers = useMemo(
    () => LAYERS.map((_, index) => STAR_FIELD.filter((star) => star.layer === index)),
    []
  );

  // Subtle parallax: only for fine pointers, never under reduced motion.
  useEffect(() => {
    if (reducedMotion) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    const onMove = (event) => {
      targetRef.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        const node = parallaxRef.current;
        if (!node) return;
        const { x, y } = targetRef.current;
        node.style.setProperty('--px', x.toFixed(3));
        node.style.setProperty('--py', y.toFixed(3));
      });
    };

    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [reducedMotion]);

  return (
    <div className="starfield" aria-hidden="true">
      <div className="starfield__parallax" ref={parallaxRef}>
        {layers.map((stars, index) => (
          <div
            key={LAYERS[index].className}
            className={`starfield__layer ${LAYERS[index].className}`}
            style={{ '--depth': LAYERS[index].drift }}
          >
            {stars.map((star) => (
              <span
                key={star.id}
                className="starfield__star"
                style={{
                  left: star.left,
                  top: star.top,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  '--star-opacity': star.opacity,
                  '--twinkle-duration': `${star.duration}s`,
                  '--twinkle-delay': `${star.delay}s`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {!reducedMotion && (
        <>
          <span className="shooting-star shooting-star--one" />
          <span className="shooting-star shooting-star--two" />
        </>
      )}
      <div className="starfield__vignette" />
    </div>
  );
}
