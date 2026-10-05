/**
 * Real, validated demo evidence.
 *
 * This demo is built around a single real starting occupation — Software
 * Developer (ESCO 2512.4) — rather than several hypothetical skills. Every
 * number below comes from the validated transition analysis: 762 people were
 * observed in the starting occupation, producing 926 outgoing transitions.
 *
 * The shape deliberately matches the live API response
 * (GET /api/branches -> { branches: [{ occupation, share, years, n }, ...] }),
 * so switching `VITE_USE_MOCK` off changes *where* the data comes from, never
 * how the app reads it.
 */
export const mockData = {
  default: {
    startingOccupation: 'Software Developer',
    peopleObserved: 762,
    branches: [
      { occupation: 'Software Analyst', share: 5.51, years: 3.5, n: 42 },
      { occupation: 'ICT Application Developer', share: 5.12, years: 1.63, n: 39 },
      { occupation: 'Web Developer', share: 3.15, years: 1.88, n: 24 },
    ],
  },
};

/** The one scenario this demo can currently answer for. */
export const DEFAULT_SCENARIO_KEY = 'default';

/**
 * Mock lookup: because there is only one validated starting profile, any
 * skill resolves to the same "default" scenario. Returns a record shaped
 * like the API payload (without its own `skill`, which the caller supplies).
 */
export function lookupMockSkill(skill) {
  const scenario = mockData[DEFAULT_SCENARIO_KEY];
  if (!scenario) return null;
  return { skill, branches: scenario.branches };
}

/**
 * The single supported sample profile. Clicking it in the entry form
 * pre-fills a role and skill that actually have validated data behind them,
 * so a newcomer lands straight in the real scenario.
 */
export const MOCK_SAMPLE_PROFILE = {
  role: 'Software Developer',
  // Real values in the backend's curated SKILL_MAP — each one resolves to a
  // clean, matched branch for this role, so the sample always demonstrates
  // the ideal path rather than a fallback.
  skills: ['JavaScript', 'Java', 'Requirements'],
};
