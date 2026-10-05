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

from cProfile import label
import json
from pathlib import Path
from typing import Optional
from unittest import result

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from rapidfuzz import process, fuzz

# ---------------------------------------------------------------------------
# Config — tune these two numbers based on what the real dataset supports
# ---------------------------------------------------------------------------
MIN_PEOPLE_FOR_STRONG_EVIDENCE = 20   # below this -> "limited" evidence
MIN_FUZZY_MATCH_SCORE = 90            # below this -> role not recognized at all
                                      # (exact titles are matched case-insensitively
                                      #  first, so this only governs *fuzzy* guesses:
                                      #  "Machine Learning Engineer" -> 72-86 -> 404)

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

# unique starting-occupation lookup: code -> label, and the reverse for fuzzy matching
_occupations = (
    _stats[["code_a", "label_a"]]
    .drop_duplicates()
    .rename(columns={"code_a": "code", "label_a": "label"})
)
_label_to_code = {
    label: code
    for label, code in zip(_occupations["label"], _occupations["code"])
    if isinstance(label, str) and label.strip()
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
    # Software development
    "full stack developer": "software developer",
    "full stack engineer": "software developer",
    "software engineer": "software developer",
    "swe": "software developer",

    # Frontend
    "frontend developer": "web developer",
    "front end developer": "web developer",

    # Backend
    "backend developer": "ict application developer",
    "back end developer": "ict application developer",
    "backend engineer": "ict application developer",
    "back end engineer": "ict application developer",

    # DevOps
    "devops engineer": "ict application developer",

    "ux designer": "user interface designer",
    "user experience designer": "user interface designer",
    "ui designer": "user interface designer",
    # QA
    "qa engineer": "software tester",
    "quality assurance engineer": "software tester",
}


def match_role(role_text: str):
    """
    Resolve free-text role input to a known occupation label + code.
    Checks the curated alias list FIRST (exact match on common modern
    phrasings), then falls back to fuzzy string matching for everything
    else. Fuzzy matching alone is not trustworthy for short/ambiguous
    inputs — verify unfamiliar phrasings manually before relying on them
    in a live demo.
    """
    key = role_text.strip().lower()
    if key in ROLE_ALIASES:
        alias_label = ROLE_ALIASES[key]
        target_lower = alias_label.lower()

        for label, code in _label_to_code.items():
            if isinstance(label, str) and label.lower() == target_lower:
                return label, code, 100.0
        # alias target not actually present in this dataset build — fall
        # through to fuzzy matching rather than silently failing

    # Exact occupation title, ignoring case. The labels are stored lowercase,
    # so a title-cased query like "Software Developer" would otherwise be
    # scored down by the (case-sensitive) fuzzy matcher and wrongly rejected.
    # The reported confidence still reflects the real string similarity.
    if key in _label_to_code:
        return key, _label_to_code[key], fuzz.WRatio(role_text, key)

    if not _all_labels:
        return None, None, 0
    result = process.extractOne(key, _all_labels, scorer=fuzz.WRatio)

    if result is None:
        return None, None, 0

    label, score, _ = result

# Don't accept weak/ambiguous fuzzy matches.
    if score < MIN_FUZZY_MATCH_SCORE:
        return None, None, score

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

    # match_role already rejects weak fuzzy guesses internally; a non-None
    # label here is a deliberate match (alias, exact title, or strong fuzzy
    # guess), so we trust it rather than re-applying the fuzzy threshold —
    # an exact title can legitimately score below it (e.g. "Software
    # Developer" -> 88.9 because the stored label is lowercase).
    if matched_label is None:
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
