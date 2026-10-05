import { useState } from 'react';

/**
 * Entry screen: capture the starting profile.
 * Chips are real buttons (removable by mouse, touch or keyboard) and the
 * CTA stays disabled until a role and at least one skill are present.
 */
export default function ProfileInput({ initialProfile, onSubmit, sample = null }) {
  const [role, setRole] = useState(initialProfile?.role ?? '');
  const [experience, setExperience] = useState(
    initialProfile?.experience === undefined || initialProfile?.experience === null
      ? ''
      : String(initialProfile.experience)
  );
  const [skills, setSkills] = useState(initialProfile?.skills ?? []);
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);

  const normalizedDraft = draft.trim().replace(/,$/, '');
  const duplicate = skills.some((s) => s.toLowerCase() === normalizedDraft.toLowerCase());
  const canAddDraft = normalizedDraft.length > 0 && !duplicate;

  const addSkill = (value) => {
    const next = String(value || '')
      .trim()
      .replace(/,$/, '');
    if (!next) return;
    setSkills((prev) =>
      prev.some((s) => s.toLowerCase() === next.toLowerCase()) ? prev : [...prev, next]
    );
    setDraft('');
  };

  const removeSkill = (value) => {
    setSkills((prev) => prev.filter((s) => s !== value));
  };

  /**
   * Fill the form with the one validated sample: a real starting role plus a
   * skill the dataset can actually answer for, so the click lands on the real
   * scenario instead of an unsupported one.
   */
  const applySample = () => {
    if (!sample) return;
    setRole(sample.role ?? '');
    setSkills((prev) => {
      const next = [...prev];
      (sample.skills ?? []).forEach((value) => {
        if (!next.some((s) => s.toLowerCase() === value.toLowerCase())) next.push(value);
      });
      return next;
    });
    setDraft('');
    setTouched(true);
  };

  const onChipKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (canAddDraft) addSkill(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && skills.length > 0) {
      event.preventDefault();
      removeSkill(skills[skills.length - 1]);
    }
  };

  const roleMissing = role.trim().length === 0;
  const skillsMissing = skills.length === 0;
  const ready = !roleMissing && !skillsMissing;

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (!ready) return;
    const years = experience === '' ? null : Number(experience);
    onSubmit({
      role: role.trim(),
      experience: Number.isFinite(years) ? years : null,
      skills,
    });
  };

  // Keep the form tidy: no negative or absurdly long careers.
  const experienceWarning =
    experience !== '' && (!Number.isFinite(Number(experience)) || Number(experience) < 0 || Number(experience) > 60);

  return (
    <div className="profile-screen">
      <section className="panel" aria-labelledby="profile-heading">
        <p className="panel__eyebrow">Career what-if simulator</p>
        <h1 className="panel__title" id="profile-heading">
          Tell us where you&rsquo;re starting from
        </h1>
        <p className="panel__subtitle">
          We&rsquo;ll map how people with a similar starting point have actually moved
          after picking up a new skill. Historical patterns — never a promise.
        </p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="role">
              Current role
            </label>
            <input
              id="role"
              className="input"
              type="text"
              name="role"
              placeholder="e.g. Software Developer"
              value={role}
              autoComplete="organization-title"
              onChange={(event) => setRole(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && roleMissing}
              aria-describedby={touched && roleMissing ? 'role-error' : undefined}
            />
            {touched && roleMissing && (
              <p className="field__error" id="role-error">
                Add your current role to continue.
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="experience">
              Years of experience <span className="field__hint">optional</span>
            </label>
            <input
              id="experience"
              className="input"
              type="number"
              name="experience"
              inputMode="numeric"
              min="0"
              max="60"
              step="1"
              placeholder="e.g. 4"
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
            />
            {experienceWarning && (
              <p className="field__error">Use a number between 0 and 60.</p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="skill-input">
              Skills you already have
            </label>
            <div className="chips" role="list" aria-label="Your skills">
              {skills.map((skill) => (
                <span className="chip" role="listitem" key={skill}>
                  <span className="chip__label">{skill}</span>
                  <button
                    type="button"
                    className="chip__remove"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Remove ${skill}`}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}
              <input
                id="skill-input"
                className="chips__input"
                type="text"
                value={draft}
                placeholder={skills.length === 0 ? 'Type a skill and press Enter' : 'Add another'}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onChipKeyDown}
                onBlur={() => {
                  if (canAddDraft) addSkill(draft);
                }}
                aria-describedby="skills-help"
              />
            </div>
            <p className="field__hint" id="skills-help">
              Press Enter or comma to add. Backspace removes the last chip.
            </p>
            {touched && skillsMissing && (
              <p className="field__error">Add at least one skill so we can map your what-ifs.</p>
            )}

            {sample && (
              <div className="suggestions">
                <span className="suggestions__label">Try a sample</span>
                <div className="suggestions__row">
                  <button type="button" className="suggestion" onClick={applySample}>
                    + {sample.role} · {sample.skills.join(', ')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button type="submit" className="cta" disabled={!ready}>
            Explore my paths
          </button>
          {!ready && (
            <p className="form__note" aria-live="polite">
              {roleMissing && skillsMissing
                ? 'A role and at least one skill unlock the sky.'
                : roleMissing
                  ? 'Add your current role to unlock the sky.'
                  : 'Add at least one skill to unlock the sky.'}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
