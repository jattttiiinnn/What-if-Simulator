import { useEffect, useRef, useState } from 'react';

/**
 * Top navigation bar.
 *
 * Purely additive: it is a fixed overlay above the sky, so it never changes
 * the constellation stage's measured height and cannot disturb the reveal.
 *
 * Two real destinations only:
 *   - Explorer    → the constellation sky (the app's default/home screen)
 *   - Methodology → the static "where the data comes from" page
 * `match` lists the app screens that light the item up; the entry form counts
 * as part of Explorer, which was the previous default.
 */

const NAV_ITEMS = [
  { id: 'explorer', label: 'Explorer', match: ['constellation', 'profile'] },
  { id: 'methodology', label: 'Methodology', match: ['methodology'] },
];

export default function Navbar({ screen, audio, onEditProfile, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  // Collapse the menu whenever the screen changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [screen]);

  // Dismiss the collapsed nav on Escape or an outside tap.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  const isActive = (item) => item.match.includes(screen);

  const handleSelect = (item) => {
    setMenuOpen(false);
    if (!isActive(item)) onNavigate?.(item.id);
  };

  return (
    <header
      className={`navbar${menuOpen ? ' is-menu-open' : ''}`}
      ref={rootRef}
    >
      <div className="navbar__inner">
        <span className="navbar__wordmark">
          <svg
            className="navbar__star"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 0 Q13.2 10.8 24 12 Q13.2 13.2 12 24 Q10.8 13.2 0 12 Q10.8 10.8 12 0 Z"
              fill="currentColor"
            />
          </svg>
          <span className="navbar__brand">
            <span className="navbar__brand-dim">Career</span>
            <span className="navbar__brand-bright">Navigator</span>
          </span>
        </span>

        <nav className="navbar__nav" id="primary-nav" aria-label="Primary">
          <div className="navbar__links">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`navbar__link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleSelect(item)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="navbar__actions">
            {screen === 'constellation' && (
              <button type="button" className="ghost-button" onClick={onEditProfile}>
                Edit profile
              </button>
            )}
            <button
              type="button"
              className={`ghost-button ghost-button--icon${
                audio?.enabled ? ' is-on' : ''
              }`}
              onClick={audio?.toggle}
              aria-pressed={audio?.enabled}
              aria-label={audio?.enabled ? 'Turn sound off' : 'Turn sound on'}
              title={audio?.enabled ? 'Sound on' : 'Sound off'}
            >
              <span aria-hidden="true">{audio?.enabled ? '♪' : '♪̸'}</span>
            </button>
          </div>
        </nav>

        <button
          type="button"
          className="navbar__menu"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="navbar__menu-bars" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
