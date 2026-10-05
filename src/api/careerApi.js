import { lookupMockSkill } from '../data/mockData';

/**
 * True when the app should read the bundled sample dataset.
 * Defaults to mock so `npm install && npm run dev` works with no backend.
 */
export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK ?? 'true').toLowerCase() !== 'false';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

/** How many destination occupations to ask the backend for. */
const TOP_N = 3;

/** Simulated network latency so loading states are visible in development. */
const MOCK_LATENCY_MS = 520;

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    }
  });
}

/** Coerce a value to a finite number, or null if it isn't usable. */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Coerce one raw branch into the exact shape the UI expects, and drop
 * anything unusable. We never invent numbers: a branch without evidence
 * comes back with share 0 / n 0 and is rendered as the dim "limited
 * evidence" star.
 *
 * The real API calls the central tendency `median_years` and additionally
 * supplies `p25_years` / `p75_years`; the bundled sample uses `years`.
 * Both are accepted so the same component reads either source.
 */
function normalizeBranch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const occupation = String(raw.occupation ?? '').trim();
  if (!occupation) return null;

  const n = Number(raw.n);
  const share = Number(raw.share);
  const median = finiteOrNull(raw.median_years ?? raw.years);
  const p25 = finiteOrNull(raw.p25_years);
  const p75 = finiteOrNull(raw.p75_years);
  const evidenceCount = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  const hasEvidence = evidenceCount > 0;

  return {
    occupation,
    code: raw.code != null ? String(raw.code) : null,
    share: hasEvidence && Number.isFinite(share) ? Math.max(0, share) : 0,
    years: hasEvidence && median !== null && median > 0 ? median : null,
    p25Years: hasEvidence && p25 !== null && p25 > 0 ? p25 : null,
    p75Years: hasEvidence && p75 !== null && p75 > 0 ? p75 : null,
    n: evidenceCount,
  };
}

/**
 * Normalise the whole response envelope.
 *
 * Live API envelope:
 *   { query_role, matched_occupation, matched_code, match_confidence,
 *     people_observed, evidence_level, skill_match, branches[] }
 *
 * The bundled sample omits the envelope, so every field defaults to the
 * "strong evidence, role-only exploration" case.
 */
export function normalizeResponse(raw, requestedSkill) {
  const skill = String(raw?.skill ?? requestedSkill ?? '').trim();
  const parsed = Array.isArray(raw?.branches)
    ? raw.branches.map(normalizeBranch).filter(Boolean)
    : [];

  // An occupation can only be one star: keep the best-evidenced occurrence.
  const byOccupation = new Map();
  parsed.forEach((branch) => {
    const key = branch.occupation.toLowerCase();
    const existing = byOccupation.get(key);
    if (!existing || branch.n > existing.n) byOccupation.set(key, branch);
  });

  const evidenceLevel = ['strong', 'limited', 'none'].includes(raw?.evidence_level)
    ? raw.evidence_level
    : 'strong';
  const skillMatch =
    raw?.skill_match === 'matched' || raw?.skill_match === 'none'
      ? raw.skill_match
      : null;

  return {
    skill,
    branches: [...byOccupation.values()],
    // Envelope metadata — used for the new "honest state" messages.
    queryRole: raw?.query_role ?? null,
    matchedOccupation: raw?.matched_occupation ?? null,
    matchedCode: raw?.matched_code ?? null,
    matchConfidence: finiteOrNull(raw?.match_confidence),
    peopleObserved: finiteOrNull(raw?.people_observed),
    evidenceLevel,
    skillMatch,
  };
}

/**
 * Fetch observed transitions into `skill`'s neighbouring occupations.
 *
 * Real backend target:
 *   GET {VITE_API_BASE}/api/branches?role=&skill=&top_n=3
 * `skill` is omitted entirely when none is selected (never sent empty).
 *
 * @param {{ role?: string, skill?: string, experience?: number|string, signal?: AbortSignal }} params
 * @returns {Promise<ReturnType<typeof normalizeResponse>>}
 */
export async function fetchBranches({ role = '', skill, experience = '', signal } = {}) {
  if (USE_MOCK) {
    await sleep(MOCK_LATENCY_MS, signal);
    const record = lookupMockSkill(skill);
    if (!record) {
      // Unknown skill: an honest empty result, not synthesised numbers.
      return normalizeResponse({ skill, branches: [] }, skill);
    }
    return normalizeResponse(record, skill);
  }

  const url = new URL(`${API_BASE}/api/branches`, window.location.origin);
  url.searchParams.set('role', role);
  // Optional: omit the parameter entirely rather than sending an empty string.
  if (skill) url.searchParams.set('skill', skill);
  url.searchParams.set('top_n', String(TOP_N));

  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the evidence service.');
  }

  if (!response.ok) {
    if (response.status === 404) {
      // Distinct from evidence_level "none": the role itself wasn't matched.
      throw new ApiError("We don't recognize that role yet.", {
        status: 404,
        code: 'ROLE_NOT_FOUND',
      });
    }
    throw new ApiError(`Evidence service responded with ${response.status}.`, {
      status: response.status,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('Evidence service returned an unreadable response.');
  }

  return normalizeResponse(payload, skill);
}
