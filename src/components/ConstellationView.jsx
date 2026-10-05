import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BackgroundStars from './BackgroundStars';
import EvidenceSheet from './EvidenceSheet';
import { USE_MOCK, fetchBranches } from '../api/careerApi';
import {
  computeLayout,
  destinationAngles,
  project,
  satelliteAngles,
  shareToSize,
  shareToStroke,
  yearsToRadius,
} from '../lib/geometry';
import { useElementSize } from '../hooks/useElementSize';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const MAX_SATELLITES = 4;
const REVEAL_STAGGER_MS = 200;

/**
 * The night sky.
 *
 * - hero star  = the profile you entered
 * - satellites = "what if I learn X" triggers (buttons, not a select)
 * - branches   = observed destination occupations, position/size/line weight
 *                all encoding real numbers, revealed one at a time
 */
export default function ConstellationView({ profile, audio, onEditProfile, onStartOver }) {
  const stageRef = useRef(null);
  const { width, height } = useElementSize(stageRef);
  const reducedMotion = usePrefersReducedMotion();

  const satellites = useMemo(
    () => (profile.skills || []).slice(0, MAX_SATELLITES),
    [profile.skills]
  );
  const angles = useMemo(() => satelliteAngles(satellites.length), [satellites.length]);

  const [activeSkill, setActiveSkill] = useState(null);
  // idle | loading | ready | error | unknown-role
  const [status, setStatus] = useState('idle');
  const [branches, setBranches] = useState([]);
  // Envelope metadata from the real API: evidence_level, skill_match, etc.
  const [meta, setMeta] = useState(null);
  const [revealed, setRevealed] = useState(0);
  // Bumped only when a fetch resolves, so viewport changes can never restart
  // the reveal: geometry re-computes, the animation state does not.
  const [revealToken, setRevealToken] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [sheet, setSheet] = useState(null); // { kind: 'branch' | 'profile', branch? }
  const [announcement, setAnnouncement] = useState('');

  const returnFocusRef = useRef(null);

  // Keep the latest audio helper without retriggering fetches.
  const playRef = useRef(() => {});
  useEffect(() => {
    playRef.current = (name) => audio?.play?.(name);
  }, [audio]);

  const layout = useMemo(() => computeLayout(width, height), [width, height]);
  const cx = width / 2;
  const cy = height / 2;

  const satellitePositions = useMemo(
    () =>
      satellites.map((skill, index) => {
        const angle = angles[index] ?? -90;
        const { x, y } = project(
          cx,
          cy,
          layout.satelliteRadius,
          angle,
          layout.aspectY
        );
        return { skill, angle, x, y };
      }),
    [satellites, angles, cx, cy, layout.satelliteRadius, layout.aspectY]
  );

  const activeIndex = satellites.findIndex((skill) => skill === activeSkill);
  const baseAngle = activeIndex >= 0 ? angles[activeIndex] : -90;
  const anchor =
    activeIndex >= 0 ? satellitePositions[activeIndex] : { x: cx, y: cy };

  const branchPositions = useMemo(() => {
    if (!activeSkill || branches.length === 0) return [];
    const spread = destinationAngles(baseAngle, branches.length);
    const maxShare = Math.max(...branches.map((branch) => branch.share || 0), 0);
    return branches.map((branch, index) => {
      const hasEvidence = branch.n > 0;
      const radius = hasEvidence
        ? yearsToRadius(branch.years, layout)
        : layout.radiusMin;
      const { x, y } = project(cx, cy, radius, spread[index], layout.aspectY);
      return {
        ...branch,
        hasEvidence,
        x,
        y,
        radius,
        size: shareToSize(branch.share, layout.sizeScale),
        stroke: shareToStroke(branch.share, maxShare),
      };
    });
  }, [activeSkill, branches, baseAngle, layout, cx, cy]);

  // --- data ------------------------------------------------------------
  useEffect(() => {
    if (!activeSkill) {
      setStatus('idle');
      setBranches([]);
      setRevealed(0);
      setRevealToken(0);
      setErrorMessage('');
      setMeta(null);
      return undefined;
    }

    const controller = new AbortController();
    let live = true;
    setStatus('loading');
    setBranches([]);
    setRevealed(0);
    setErrorMessage('');
    setMeta(null);

    fetchBranches({
      role: profile.role,
      skill: activeSkill,
      experience: profile.experience,
      signal: controller.signal,
    })
      .then((result) => {
        if (!live) return;
        setBranches(result.branches);
        setRevealToken((token) => token + 1);
        setStatus('ready');
        setMeta({
          evidenceLevel: result.evidenceLevel,
          peopleObserved: result.peopleObserved,
          skillMatch: result.skillMatch,
          matchedOccupation: result.matchedOccupation,
          matchConfidence: result.matchConfidence,
        });
        playRef.current(result.branches.length > 0 ? 'reveal' : 'click');
        if (result.branches.length > 0) {
          setAnnouncement(
            `${result.branches.length} observed ${
              result.branches.length === 1 ? 'path' : 'paths'
            } after learning ${activeSkill}.`
          );
        } else if (result.evidenceLevel === 'limited' || result.evidenceLevel === 'none') {
          setAnnouncement(
            `Not enough people observed for this role (${result.peopleObserved ?? 0}) to show a breakdown.`
          );
        } else {
          setAnnouncement(`No recorded transitions after learning ${activeSkill} yet.`);
        }
      })
      .catch((error) => {
        if (!live || error?.name === 'AbortError') return;
        if (error?.code === 'ROLE_NOT_FOUND') {
          setStatus('unknown-role');
          setMeta(null);
          setAnnouncement("That role wasn't recognized. Try a more standard job title.");
          return;
        }
        setStatus('error');
        setErrorMessage(error?.message || 'Something went wrong reading the evidence.');
        setAnnouncement('Evidence could not be loaded. You can retry.');
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [activeSkill, profile.role, profile.experience, reloadToken]);

  // --- staggered reveal -------------------------------------------------
  // Depends on the reveal token (one per fetch) rather than on layout state,
  // so resizing or rotating mid-reveal never replays the animation.
  useEffect(() => {
    if (revealToken === 0 || branches.length === 0) return undefined;
    if (reducedMotion) {
      setRevealed(branches.length);
      return undefined;
    }
    setRevealed(1);
    let shown = 1;
    const timer = window.setInterval(() => {
      shown += 1;
      setRevealed(shown);
      if (shown >= branches.length) window.clearInterval(timer);
    }, REVEAL_STAGGER_MS);
    return () => window.clearInterval(timer);
  }, [revealToken, branches.length, reducedMotion]);

  const visibleBranches = reducedMotion
    ? branchPositions
    : branchPositions.slice(0, revealed);

  // --- interactions -----------------------------------------------------
  const openSheet = useCallback((next) => {
    returnFocusRef.current = document.activeElement;
    setSheet(next);
    playRef.current(next?.kind === 'branch' ? 'open' : 'click');
  }, []);

  const closeSheet = useCallback(() => {
    playRef.current('close');
    setSheet(null);
    const node = returnFocusRef.current;
    if (node && document.contains(node) && typeof node.focus === 'function') {
      window.setTimeout(() => node.focus(), 0);
    }
  }, []);

  const handleSatellite = useCallback(
    (skill) => {
      playRef.current('click');
      setSheet(null);
      const turningOff = activeSkill === skill;
      setActiveSkill(turningOff ? null : skill);
      if (turningOff) setAnnouncement('');
    },
    [activeSkill]
  );

  const loadingSkill = status === 'loading' ? activeSkill : null;
  const evidenceLevel = meta?.evidenceLevel ?? 'strong';
  // Role matched but too few people observed: an honest empty sky, not zeros.
  const insufficientEvidence =
    status === 'ready' && (evidenceLevel === 'limited' || evidenceLevel === 'none');
  const showEmptyNote =
    status === 'ready' && branches.length === 0 && !insufficientEvidence;
  const peopleObserved = meta?.peopleObserved;
  // Skill unrecognised (or no branch for this role): branches are the role's
  // general trends, not filtered by the chosen skill.
  const showSkillNote =
    status === 'ready' &&
    branches.length > 0 &&
    meta?.skillMatch === 'none' &&
    !!activeSkill;

  return (
    <div className="constellation" ref={stageRef}>
      <BackgroundStars reducedMotion={reducedMotion} />

      <svg
        className="links"
        width={width}
        height={height}
        viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
        aria-hidden="true"
        focusable="false"
      >
        {/*
          Each trail is a path with pathLength="1", so the draw animation uses
          constant dash values. Nothing that feeds a keyframe is ever written to
          these elements again — on resize React only updates `d`, and the
          in-flight draw keeps its progress.
        */}
        {visibleBranches.map((branch) => {
          const d = `M ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} L ${branch.x.toFixed(
            1
          )} ${branch.y.toFixed(1)}`;
          return (
            <g key={branch.occupation}>
              {branch.hasEvidence ? (
                <>
                  <path
                    className="link link--glow"
                    d={d}
                    pathLength="1"
                    strokeWidth={Math.max(2.5, branch.stroke * 3)}
                  />
                  <path
                    className="link"
                    d={d}
                    pathLength="1"
                    strokeWidth={branch.stroke}
                  />
                </>
              ) : (
                <path
                  className="link link--dim"
                  d={d}
                  pathLength="1"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}
      </svg>

      <button
        type="button"
        className="hero-star"
        onClick={() => openSheet({ kind: 'profile' })}
        aria-label={`${profile.role}. Open your profile summary.`}
      >
        <span className="hero-star__core" style={{ '--hero-size': `${layout.heroSize}px` }} />
        <span className="hero-star__label">{profile.role}</span>
        <span className="hero-star__sub">you are here</span>
      </button>

      {satellitePositions.map((position) => {
        const isActive = position.skill === activeSkill;
        const isLoading = loadingSkill === position.skill;
        return (
          <button
            key={position.skill}
            type="button"
            className={[
              'satellite',
              isActive ? 'is-active' : '',
              isLoading ? 'is-loading' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
            onClick={() => handleSatellite(position.skill)}
            aria-pressed={isActive}
            aria-label={`What if I learn ${position.skill}`}
          >
            <span className="satellite__dot" aria-hidden="true" />
            <span className="satellite__label">{position.skill}</span>
          </button>
        );
      })}

      {visibleBranches.map((branch) => (
        <button
          key={branch.occupation}
          type="button"
          className={`dest-star${branch.hasEvidence ? '' : ' is-dim'}`}
          // Only positioning: the mount (not a resize) drives the entrance.
          style={{
            left: `${branch.x}px`,
            top: `${branch.y}px`,
            '--size': `${branch.size}px`,
          }}
          onClick={() => openSheet({ kind: 'branch', branch })}
          aria-label={
            branch.hasEvidence
              ? `${branch.occupation}: ${branch.share}% observed transition share, based on ${branch.n} trajectories${
                  branch.years ? `, typical time to transition about ${branch.years} years` : ''
                }`
              : `${branch.occupation}: limited evidence for this path`
          }
        >
          <span className="dest-star__core" aria-hidden="true" />
          <span className="dest-star__caption">
            <span className="dest-star__label">{branch.occupation}</span>
            {!branch.hasEvidence && (
              <span className="dest-star__note">limited evidence</span>
            )}
          </span>
        </button>
      ))}

      {(loadingSkill ||
        status === 'error' ||
        status === 'unknown-role' ||
        insufficientEvidence ||
        showEmptyNote) && (
        <div className="stage-notice" role="status">
          {loadingSkill && <span>Reading transitions for {loadingSkill}…</span>}
          {status === 'unknown-role' && (
            <>
              <span>
                We don&rsquo;t recognize that role yet. Try a more standard job
                title — for example &ldquo;Software Developer&rdquo;, &ldquo;Web
                Developer&rdquo; or &ldquo;Software Analyst&rdquo;.
              </span>
              {onEditProfile && (
                <button
                  type="button"
                  className="notice-retry"
                  onClick={onEditProfile}
                >
                  Try another role
                </button>
              )}
            </>
          )}
          {status === 'error' && (
            <>
              <span>{errorMessage}</span>
              <button
                type="button"
                className="notice-retry"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                Retry
              </button>
            </>
          )}
          {insufficientEvidence && (
            <span>
              {typeof peopleObserved === 'number'
                ? `Only ${peopleObserved.toLocaleString()} ${
                    peopleObserved === 1 ? 'person' : 'people'
                  } observed for this role — not enough for a confident breakdown. Try another role.`
                : 'Not enough people observed for this role yet — try another role.'}
            </span>
          )}
          {showEmptyNote && (
            <span>
              No recorded transitions after learning {activeSkill} yet. Try another
              skill.
            </span>
          )}
        </div>
      )}

      {showSkillNote && (
        <p className="branch-note" role="status">
          Showing general trends for this role — no specific skill association yet
          for &ldquo;{activeSkill}&rdquo;.
        </p>
      )}

      <div className="legend">
        <span className="legend__line">
          size = likelihood · distance = typical time · line = likelihood
        </span>
        {USE_MOCK && <span className="legend__badge">sample dataset</span>}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {sheet && (
        <EvidenceSheet
          open
          kind={sheet.kind}
          branch={sheet.branch}
          skill={activeSkill}
          profile={profile}
          onClose={closeSheet}
          onEditProfile={() => {
            closeSheet();
            onEditProfile?.();
          }}
          onStartOver={() => {
            closeSheet();
            onStartOver?.();
          }}
        />
      )}
    </div>
  );
}
