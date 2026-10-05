# Career What-If Simulator

Career guidance as a night sky. You enter where you're starting from, then explore
"what if I learn X" by clicking small orbiting skill dots around your central star.
Each click ignites a constellation of destinations connected by light trails — every
position, size and line weight encodes a real number from observed career transitions.

```bash
npm install
npm run dev
```

A fresh checkout runs against the bundled sample dataset, so no backend is needed.
To run against the real backend, set `VITE_USE_MOCK=false` and `VITE_API_BASE` (see
below) and start the API in `backend/`:

```bash
cd backend && uvicorn backend_main:app --port 8000
```

## Files

```
index.html                 Vite entry (dark theme, viewport-fit=cover)
src/main.jsx               React root
src/App.jsx                Screen switching, fade transition, profile boot-rehydrate
src/components/
  Navbar.jsx               Fixed top nav: CAREER NAVIGATOR wordmark + Explorer/
                           Methodology links, Edit profile + sound toggle
  Methodology.jsx          Static page: data source, what the numbers mean, limits
  ProfileInput.jsx         Entry form: role, experience, skill chips, glowing CTA
  ConstellationView.jsx    Hero star, satellites, staggered branch reveal, legend
  EvidenceSheet.jsx        Frosted bottom sheet with the full evidence
  BackgroundStars.jsx      Static twinkling starfield + parallax + shooting stars
src/data/mockData.js       Validated demo scenario shaped exactly like the API response
src/api/careerApi.js       fetchBranches() + USE_MOCK toggle + response normalising
src/lib/geometry.js        Pure layout maths (radii, angles, size/stroke encoding)
src/lib/profileStorage.js  localStorage read/validate/write/clear for the profile
src/hooks/                 Reduced-motion, opt-in audio, element-size helpers
src/styles.css             The whole theme in one stylesheet
```

## Data honesty

Nothing in the UI fabricates a number:

- a branch with zero recorded trajectories renders as a dim grey star labelled
  "limited evidence" and its sheet says so instead of showing a share or a timeframe
- when the backend reports `evidence_level: "limited"` or `"none"`, no empty
  constellation is drawn — the sky shows "Only {people_observed} people observed for this
  role — not enough for a confident breakdown"
- when the role itself isn't recognised (`404`), that is treated differently from matched
  but data-less roles: "We don't recognize that role yet" with example roles and a
  **Try another role** action
- when `skill_match: "none"`, the branches shown are the role's general trends, and a
  quiet inline note says so: "Showing general trends for this role — no specific skill
  association yet for '{skill}'"
- a skill with no recorded transitions shows "No recorded transitions after learning X yet"
- a failed request shows the API error with a **Retry** button
- percentages are always phrased as observed transition share + evidence count
- every sheet ends with "Reflects historical movement patterns, not a prediction for
  any individual."

## Mock vs real API

| `VITE_USE_MOCK` | behaviour |
| --- | --- |
| unset / `true` *(default)* | `src/data/mockData.js`, with simulated latency so loading states are visible |
| `false` | `GET {VITE_API_BASE}/api/branches` |

```bash
cp .env.example .env          # then set VITE_API_BASE and VITE_USE_MOCK=false
```

### Endpoint contract

```
GET /api/branches?role={role}&skill={skill}&top_n=3
```

`skill` is omitted entirely when no skill is selected (never sent empty).

```json
{
  "query_role": "Software Developer",
  "matched_occupation": "software developer",
  "matched_code": "2512.4",
  "match_confidence": 88.9,
  "people_observed": 750,
  "evidence_level": "strong",
  "skill_match": "matched",
  "branches": [
    {
      "occupation": "web developer",
      "code": "2513.5",
      "share": 4.13,
      "median_years": 1.88,
      "p25_years": 1.0,
      "p75_years": 2.88,
      "n": 31
    }
  ]
}
```

- `evidence_level` is `"strong"` | `"limited"` | `"none"`; the latter two return an
  empty `branches` array and drive the honest empty-sky states.
- `skill_match` is `"matched"` | `"none"` | `null` (no skill selected). `"matched"` is
  the ideal case; `"none"` means the branches are the role's general trends, shown with
  an inline note.
- a **404** means the role text wasn't matched to any occupation (distinct from
  `evidence_level: "none"`, which is a matched role with no data).
- each branch carries `share` (observed transition share, percent), `median_years`
  (typical time to transition), `p25_years`/`p75_years` (the typical range, surfaced in
  the evidence sheet), and `n` (number of real trajectories behind it).

Responses are normalised: numeric strings are coerced, entries without an occupation
are dropped, duplicates collapse to the best-evidenced occurrence, and a branch without
evidence comes back as `share: 0, n: 0` rather than invented numbers. The bundled sample
in `src/data/mockData.js` uses `years` instead of `median_years`; both are accepted, so
switching `VITE_USE_MOCK` changes only where data comes from, never how it reads.

## Visual encoding

| Channel | Encodes |
| --- | --- |
| destination star size | observed transition share |
| distance from the hero star | typical transition time (1.6 yrs ≈ near ring, 3.6 yrs ≈ far ring, clamped outside) |
| connector thickness | share relative to the largest share currently on screen |

## Resize-safe reveal

The constellation re-lays out on every viewport change (rotation, window drag, a judge
tilting a phone), but the reveal animation is deliberately decoupled from geometry:

- trails are `<path pathLength="1">` elements, so the draw animation uses *constant*
dash values. No measured length or custom property ever feeds a keyframe, and nothing
  that participates in the animation is written back to the element
- the stagger is keyed to a per-fetch token, not to layout state, so a resize cannot
  re-run it — React only updates `d`/`left`/`top` while the draw keeps its progress
- stable `key`s per occupation mean branch stars are never remounted mid-reveal

## Persistence

The entered profile is stored in `localStorage` (`cws:profile`) on submit, so a refresh
drops you back on your own sky instead of a blank form. Stored data is re-validated on
load (role + at least one skill, else ignored), and **Start over** — in the hero sheet —
clears it.

## Accessibility & motion

- satellites and destination stars are real `<button>`s: focusable and activatable with
  Enter/Space, with descriptive `aria-label`s and an `aria-live` announcement per reveal
- the evidence sheet is a focus-trapped dialog: Escape, backdrop click, swipe-down, close button
- `prefers-reduced-motion` removes the staggered reveal, drawing animation, twinkle,
  parallax and shooting stars, and falls back to instant fades
- safe-area insets are respected and the sky re-lays out down to 375px (portrait skies
  stretch on the vertical axis instead of piling the rings on top of each other)
