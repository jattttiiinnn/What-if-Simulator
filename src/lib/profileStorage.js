/**
 * Tiny persistence layer for the entered profile.
 * Demo insurance: a refresh (or an accidental trackpad bump) drops the user
 * back onto their own constellation instead of a blank form.
 */

const STORAGE_KEY = 'cws:profile';
const MAX_SKILLS = 8;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / storage disabled
  }
}

/** Reads and re-validates the stored profile. Returns null when unusable. */
export function loadStoredProfile() {
  const store = storage();
  if (!store) return null;

  let parsed;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const role = typeof parsed?.role === 'string' ? parsed.role.trim() : '';
  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills
        .filter((skill) => typeof skill === 'string' && skill.trim().length > 0)
        .map((skill) => skill.trim())
        .slice(0, MAX_SKILLS)
    : [];

  // The same rule the form enforces: no role or no skill, nothing to show.
  if (!role || skills.length === 0) return null;

  const rawExperience = parsed?.experience;
  const experience =
    rawExperience === null ||
    rawExperience === undefined ||
    rawExperience === '' ||
    !Number.isFinite(Number(rawExperience))
      ? null
      : Number(rawExperience);

  return { role, experience, skills };
}

export function saveStoredProfile(profile) {
  const store = storage();
  if (!store || !profile) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        role: profile.role,
        experience: profile.experience ?? null,
        skills: profile.skills ?? [],
      })
    );
  } catch {
    /* quota or disabled storage — persistence is a convenience, not a need */
  }
}

export function clearStoredProfile() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
