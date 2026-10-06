"""
Career What-If Simulator — backend
====================================
Serves the FULL precomputed transition table (every starting occupation
JobHop has data for, not a hand-picked shortlist). A user's free-text role
is fuzzy-matched to the closest real ESCO occupation label in the data, so
"Software Developer", "SWE", "backend dev" etc. can all resolve to the
right starting point.

RUN:
    pip install fastapi uvicorn rapidfuzz pandas
    uvicorn backend_main:app --reload --port 8000

REQUIRES:
    transition_stats_full.json in the same folder — produced by running
    jobhop_pipeline.py against the real JobHop + ESCO files (see the
    [EXPORT] step at the end of that script).

ENDPOINT:
    GET /api/branches?role=<text>&top_n=3

    -> {
         "query_role": "software developer",
         "matched_occupation": "software developer",
         "matched_code": "2512.4",
         "match_confidence": 100,
         "people_observed": 762,
         "evidence_level": "strong",     # "strong" | "limited" | "none"
         "branches": [ {occupation, code, share, median_years, p25_years,
                         p75_years, n}, ... ]
       }
"""

import json
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from rapidfuzz import process, fuzz, utils

# ---------------------------------------------------------------------------
# Config — tune these two numbers based on what the real dataset supports
# ---------------------------------------------------------------------------
MIN_PEOPLE_FOR_STRONG_EVIDENCE = 20   # below this -> "limited" evidence
# Below this fuzzy score -> role not recognized at all (honest 404).
# This must sit ABOVE ~85.5: rapidfuzz WRatio scores coincidental word/
# substring overlap at a flat 85.5, which is how "backend developer"
# resolved to "leather goods product developer" and "devops engineer" to
# "food production engineer" at a confidence that looked high. Measured
# floor for genuinely-useful fuzzy input (typos, shorthand: "web developr"
# 96.0, "sofware developr" 94.1, "data scienctist" 96.6) is 90.0, so 90
# keeps real near-misses and rejects the coincidences. Aliases and exact
# titles below never depend on this threshold — they return 100 outright.
MIN_FUZZY_MATCH_SCORE = 90
MIN_PEOPLE_FOR_SKILL_MATCH = 5        # a skill-filtered branch below this is
                                       # statistically meaningless (e.g. 1
                                       # person out of thousands rounding to
                                       # "0.00%") and must fall back honestly
                                       # rather than be shown as a real match

# Curated skill -> occupation association layer. This is NOT learned from
# JobHop (JobHop has no skills field) — it's a hand-curated mapping that
# selects/reorders which real, historically-observed branches are shown
# for a given skill. Keys AND target labels are lowercase to match the
# real ESCO preferredLabel casing returned by the pipeline (confirmed
# lowercase, e.g. "web developer", not "Web Developer").
SKILL_MAP = {
    "javascript":    ["web developer"],
    "js":            ["web developer"],
    "frontend":      ["web developer"],
    "html":          ["web developer"],
    "css":           ["web developer"],
    "java":          ["ict application developer"],
    "backend":       ["ict application developer"],
    ".net":          ["ict application developer"],
    "enterprise":    ["ict application developer"],
    "requirements":  ["software analyst"],
    "communication":  ["software analyst"],
    "analysis":      ["software analyst"],
    "business analysis": ["software analyst"],
}

DATA_PATH = Path(__file__).parent / "transition_stats_full.json"

app = FastAPI(title="Career What-If Simulator API")

# allow the Vite dev server (and your deployed frontend origin later) to call this
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your real frontend origin before shipping
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Load once at startup
# ---------------------------------------------------------------------------
if not DATA_PATH.exists():
    raise RuntimeError(
        f"{DATA_PATH} not found. Run jobhop_pipeline.py against the real "
        f"JobHop + ESCO files first — it writes this file automatically."
    )

_stats = pd.read_json(DATA_PATH)

# Defensive data-quality guard: a row with NaN in any numeric field crashes
# JSON serialization at request time (standard JSON has no NaN), as found
# via batch testing ("pharmacy lecturer" crashed on every single request).
# Drop such rows at startup rather than letting a live request crash —
# this is a data issue upstream in the pipeline (a pandas quantile() call
# likely hit an empty/degenerate group for that occupation), not something
# to chase down tonight. If _n_dropped is large, investigate the pipeline;
# if it's a handful of rows, this is the correct, safe handling.
_critical_cols = ["observed_transition_share", "median_years", "p25_years", "p75_years"]
_n_before = len(_stats)
_dropped_rows = _stats[_stats[_critical_cols].isna().any(axis=1)]
_stats = _stats.dropna(subset=_critical_cols)
_n_dropped = _n_before - len(_stats)
if _n_dropped:
    _affected_roles = _dropped_rows["label_a"].unique()
    print(f"[STARTUP WARNING] Dropped {_n_dropped} row(s) with NaN in a numeric "
          f"field — these would have crashed JSON serialization at request time. "
          f"Affected starting occupation(s): {list(_affected_roles)[:20]}"
          f"{'...' if len(_affected_roles) > 20 else ''}")

# Second data-quality guard (same spirit as the numeric one above): 1,878
# rows have a NaN label_b — a transition into an occupation that cannot be
# named. Such a branch is unusable AND serializes as a bare NaN token, which
# is invalid JSON and breaks the frontend's JSON.parse. Drop exactly those
# rows. Verified safe: no starting occupation loses ALL of its rows, and
# people_out_of_a is constant per code_a, so people_observed is unchanged.
_target_is_text = _stats["label_b"].map(lambda x: isinstance(x, str))
_n_bad_targets = int((~_target_is_text).sum())
if _n_bad_targets:
    _stats = _stats[_target_is_text]
    print(f"[STARTUP WARNING] Dropped {_n_bad_targets} row(s) with a missing/"
          f"non-text branch label (label_b) — unnameable targets that would "
          f"also have produced invalid JSON at request time.")

# Unique starting-occupation lookup: label -> code, plus a lowercased view.
#
# NOTE ON CASING: the real ESCO labels are NOT uniformly lowercase — 5,237
# rows use mixed casing such as "ICT application developer" and "ICT system
# developer". The old code assumed all-lowercase, which silently broke every
# alias pointing at a mixed-case label.
#
# NOTE ON MISSING LABELS: 1,887 rows carry a NaN label_a. A NaN must never
# become a lookup KEY or an element of _all_labels — it was stored as a
# float, so any text scan over _all_labels crashed with "'float' object has
# no attribute 'lower'". These rows are excluded from the LABEL MAP only;
# they stay in _stats, because the row still describes a real, servable
# transition out of a known code_a. Dropping them outright would silently
# remove real transitions from those occupations' branch lists.
_starting_is_text = _stats["label_a"].map(lambda x: isinstance(x, str))
_occupations = (
    _stats.loc[_starting_is_text, ["code_a", "label_a"]]
    .drop_duplicates()
    .rename(columns={"code_a": "code", "label_a": "label"})
)
_label_to_code = dict(zip(_occupations["label"], _occupations["code"]))
# lowercased label -> (display label, code): single source of truth for both
# alias resolution and exact-title matching. Verified collision-free (no two
# distinct labels share a lowercase form).
_label_lower_to_code = {
    label.strip().lower(): (label, code)
    for label, code in _label_to_code.items()
}
_all_labels = list(_label_to_code.keys())


# Common modern/colloquial role phrasings that don't exist as their own
# ESCO label but map clearly to one that does. Checked BEFORE fuzzy
# matching, because pure string-similarity fuzzy matching can confidently
# mismatch a phrase like "full stack developer" to something completely
# unrelated (e.g. "leather goods product developer" — shares enough
# characters/tokens to score 85+ despite zero semantic relation). This is
# a known, verified failure mode — caught during real testing, not
# theoretical. Extend this list with whatever your own test runs surface.
ROLE_ALIASES = {
    "full stack developer": "software developer",
    "full stack engineer": "software developer",
    "software engineer": "software developer",
    "swe": "software developer",

    "frontend developer": "web developer",
    "front end developer": "web developer",

    "backend developer": "ict application developer",
    "back end developer": "ict application developer",
    "backend engineer": "ict application developer",
    "back end engineer": "ict application developer",

    "devops engineer": "ict application developer",

    "qa engineer": "software tester",
    "quality assurance engineer": "software tester",
}


def match_role(role_text: str):
    """
    Resolve free-text role input to a known occupation label + code.

    Resolution order, most trustworthy first:
      1. curated alias        — exact, case-insensitive on BOTH sides
      2. exact occupation title — case-insensitive
      3. fuzzy string matching  — last resort only, case-insensitive, over
                                  real (string) labels only

    Returns (label, code, score). (None, None, 0) means "no reliable match"
    and the endpoint turns it into an honest 404 — never a confident-looking
    but semantically unrelated occupation.
    """
    key = (role_text or "").strip().lower()
    if not key:
        return None, None, 0

    # 1) Curated alias. Both the alias key and its TARGET are compared
    #    case-insensitively, because the target labels are mixed-case in the
    #    real data ("ICT application developer"). If a known alias resolves
    #    to nothing in THIS dataset build, return "no match" instead of
    #    falling through to fuzzy: WRatio would happily offer "leather goods
    #    product developer" at 85.5 for "backend developer" — a false
    #    positive dressed up as high confidence.
    alias_label = ROLE_ALIASES.get(key)
    if alias_label is not None:
        hit = _label_lower_to_code.get(alias_label.strip().lower())
        if hit is None:
            return None, None, 0
        label, code = hit
        return label, code, 100.0

    # 2) Exact occupation title, case-insensitive — no guesswork involved,
    #    so it is an honest 100.
    hit = _label_lower_to_code.get(key)
    if hit is not None:
        label, code = hit
        return label, code, 100.0

    # 3) Last resort: fuzzy. processor=default_process lowercases and trims
    #    BOTH sides, so mixed-case labels like "ICT application developer"
    #    are reachable from lowercase input. score_cutoff makes this function
    #    honest ON ITS OWN: the flat-85.5 coincidental overlaps ("ux
    #    designer" -> "microelectronics designer", "scrum master" -> "prop
    #    master") come back as (None, None, 0) here, instead of relying on
    #    the endpoint to reject them later.
    if not _all_labels:
        return None, None, 0
    result = process.extractOne(
        key, _all_labels, scorer=fuzz.WRatio,
        processor=utils.default_process, score_cutoff=MIN_FUZZY_MATCH_SCORE,
    )
    if result is None:
        return None, None, 0
    label, score, _ = result
    return label, _label_to_code[label], score


def rows_to_branches(rows: pd.DataFrame):
    return [
        {
            "occupation": r.label_b,
            "code": r.code_b,
            "share": round(float(r.observed_transition_share) * 100, 2),
            "median_years": float(r.median_years),
            "p25_years": float(r.p25_years),
            "p75_years": float(r.p75_years),
            "n": int(r.people_a_to_b),
        }
        for r in rows.itertuples()
    ]


@app.get("/api/branches")
def get_branches(
    role: str = Query(..., min_length=1, description="User's current role, free text"),
    skill: Optional[str] = Query(
        None, description="Optional skill the user is considering learning"
    ),
    top_n: int = Query(3, ge=1, le=6),
):
    matched_label, matched_code, score = match_role(role)

    if matched_label is None or score < MIN_FUZZY_MATCH_SCORE:
        raise HTTPException(
            status_code=404,
            detail=f"No occupation in the dataset closely matches '{role}'. "
                   f"Try a more standard job title.",
        )

    # Correct order: retrieve ALL transitions for this role BEFORE any
    # skill filtering or top_n truncation — filtering after truncation can
    # silently drop the exact branch a skill should surface if it isn't
    # already in the unfiltered top N.
    all_rows = _stats[_stats["code_a"] == matched_code].copy()
    people_observed = int(all_rows["people_out_of_a"].iloc[0]) if len(all_rows) else 0

    if people_observed == 0:
        evidence_level = "none"
        return {
            "query_role": role, "matched_occupation": matched_label,
            "matched_code": matched_code, "match_confidence": round(score, 1),
            "people_observed": 0, "evidence_level": "none",
            "skill_match": None, "branches": [],
        }

    if people_observed < MIN_PEOPLE_FOR_STRONG_EVIDENCE:
        return {
            "query_role": role, "matched_occupation": matched_label,
            "matched_code": matched_code, "match_confidence": round(score, 1),
            "people_observed": people_observed, "evidence_level": "limited",
            "skill_match": None, "branches": [],  # frontend shows "limited evidence" state
        }

    all_rows_sorted = all_rows.sort_values("observed_transition_share", ascending=False)
    skill_match = None

    if skill:
        skill_key = skill.strip().lower()
        target_labels = SKILL_MAP.get(skill_key)
        if target_labels:
            filtered = all_rows_sorted[
                all_rows_sorted["label_b"].str.lower().isin(target_labels)
            ]
            # reject matches backed by too few real people — a single
            # person out of thousands (share rounding to 0.00%) is not a
            # real finding and must not be presented as a matched result
            filtered = filtered[filtered["people_a_to_b"] >= MIN_PEOPLE_FOR_SKILL_MATCH]
            if len(filtered) > 0:
                skill_match = "matched"
                branches = rows_to_branches(filtered.head(top_n))
            else:
                # skill is recognized but no corresponding branch exists for
                # THIS starting role — fall back honestly, don't fake a result
                skill_match = "none"
                branches = rows_to_branches(all_rows_sorted.head(top_n))
        else:
            # skill not in our curated map at all — fall back, stay functional
            skill_match = "none"
            branches = rows_to_branches(all_rows_sorted.head(top_n))
    else:
        branches = rows_to_branches(all_rows_sorted.head(top_n))

    return {
        "query_role": role,
        "matched_occupation": matched_label,
        "matched_code": matched_code,
        "match_confidence": round(score, 1),
        "people_observed": people_observed,
        "evidence_level": "strong",
        "skill_match": skill_match,
        "branches": branches,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "occupations_loaded": len(_occupations)}