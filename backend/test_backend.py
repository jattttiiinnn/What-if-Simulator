"""
Career What-If Simulator — automated backend test suite
==========================================================
Run with:
    pip install pytest fastapi[all] rapidfuzz pandas
    pytest test_backend.py -v

Place this file in the same folder as backend_main.py and
transition_stats_full.json (the real one, from your actual dataset run).

Uses FastAPI's TestClient — no need to manually start uvicorn first,
this imports the app directly and tests it in-process.
"""

import pytest
from fastapi.testclient import TestClient
import pandas as pd

from backend_main import app, _stats

client = TestClient(app)


# ===========================================================================
# 1. HEALTH / BASIC CONNECTIVITY
# ===========================================================================

def test_health_endpoint():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["occupations_loaded"] > 0


# ===========================================================================
# 2. ROLE MATCHING — exact, case, typo, alias
# ===========================================================================

def test_exact_lowercase_match():
    r = client.get("/api/branches", params={"role": "software developer"})
    assert r.status_code == 200
    body = r.json()
    assert body["matched_code"] == "2512.4"
    assert body["evidence_level"] == "strong"


def test_titlecase_match_not_rejected():
    """Regression test for the exact bug found during manual testing:
    title-case 'Software Developer' must match the same as lowercase,
    not get rejected by an overly strict threshold check."""
    r = client.get("/api/branches", params={"role": "Software Developer"})
    assert r.status_code == 200, (
        "Title-case input was rejected — this is the exact regression "
        "found during manual testing where the canonical demo role 404'd."
    )
    assert r.json()["matched_code"] == "2512.4"


def test_uppercase_match():
    r = client.get("/api/branches", params={"role": "SOFTWARE DEVELOPER"})
    assert r.status_code == 200
    assert r.json()["matched_code"] == "2512.4"


def test_typo_still_matches():
    r = client.get("/api/branches", params={"role": "sofware developr"})
    assert r.status_code == 200
    assert r.json()["matched_code"] == "2512.4"


@pytest.mark.parametrize("role,expected_code", [
    ("full stack developer", "2512.4"),
    ("fullstack developer", "2512.4"),
    ("swe", "2512.4"),
    ("software engineer", "2512.4"),
])
def test_known_aliases_resolve_correctly(role, expected_code):
    r = client.get("/api/branches", params={"role": role})
    assert r.status_code == 200, f"'{role}' should resolve via ROLE_ALIASES"
    assert r.json()["matched_code"] == expected_code, (
        f"'{role}' resolved to the wrong occupation — check for a "
        f"leather-goods-style false positive"
    )


def test_garbage_input_returns_404_not_a_fake_match():
    r = client.get("/api/branches", params={"role": "asdkjaslkdj nonsense xyz"})
    assert r.status_code == 404


def test_whitespace_only_role_handled_gracefully():
    """Edge case not previously tested — spaces only, should not crash
    or return a nonsense match."""
    r = client.get("/api/branches", params={"role": "   "})
    assert r.status_code in (404, 422), (
        f"Whitespace-only role should be rejected cleanly, got {r.status_code}"
    )


def test_empty_role_returns_422():
    r = client.get("/api/branches", params={"role": ""})
    assert r.status_code == 422


def test_very_long_role_does_not_crash():
    r = client.get("/api/branches", params={"role": "x" * 500})
    assert r.status_code in (404, 422)


def test_special_characters_do_not_crash():
    for role in ["Software Developer!!!", "software-developer", "  software developer  ",
                 "软件开发人员", "développeur"]:
        r = client.get("/api/branches", params={"role": role})
        assert r.status_code in (200, 404), f"Unexpected crash-like status for '{role}'"


# ===========================================================================
# 3. SKILL CONDITIONING
# ===========================================================================

def test_no_skill_returns_null_skill_match():
    r = client.get("/api/branches", params={"role": "Software Developer"})
    assert r.json()["skill_match"] is None


def test_known_skill_matches():
    r = client.get("/api/branches", params={"role": "Software Developer", "skill": "javascript"})
    body = r.json()
    assert body["skill_match"] == "matched"
    occupations = [b["occupation"] for b in body["branches"]]
    assert "web developer" in occupations


def test_unknown_skill_falls_back_honestly():
    r = client.get("/api/branches", params={"role": "Software Developer", "skill": "underwater basket weaving"})
    body = r.json()
    assert body["skill_match"] == "none"
    assert len(body["branches"]) > 0, "Should still return general branches, not an empty result"


def test_skill_filter_finds_branch_outside_naive_top_n():
    """Regression test for the filter-order bug: a skill's target branch
    must be found even if it isn't in the unfiltered top-N by share."""
    r = client.get("/api/branches", params={"role": "Software Developer", "skill": "requirements", "top_n": 3})
    body = r.json()
    occupations = [b["occupation"] for b in body["branches"]]
    assert "software analyst" in occupations, (
        "Skill filtering must search ALL branches, not just the "
        "already-truncated top_n"
    )


# ===========================================================================
# 4. EVIDENCE LEVEL GATING
# ===========================================================================

def test_strong_evidence_role_has_branches():
    r = client.get("/api/branches", params={"role": "Software Developer"})
    body = r.json()
    assert body["evidence_level"] == "strong"
    assert body["people_observed"] >= 20
    assert len(body["branches"]) > 0


def test_low_sample_role_returns_limited_not_fake_confidence():
    """Find a real low-sample occupation directly from the stats file,
    rather than hardcoding a role name that might not exist in every
    dataset build."""
    counts = _stats[["code_a", "people_out_of_a"]].drop_duplicates()
    low_sample = counts[counts["people_out_of_a"] < 20]
    if low_sample.empty:
        pytest.skip("No low-sample occupations in this dataset build")
    label = _stats[_stats["code_a"] == low_sample.iloc[0]["code_a"]]["label_a"].iloc[0]
    r = client.get("/api/branches", params={"role": label})
    body = r.json()
    assert body["evidence_level"] == "limited"
    assert body["branches"] == []


# ===========================================================================
# 5. RESPONSE SCHEMA — every field present, correct types
# ===========================================================================

def test_response_schema_complete():
    r = client.get("/api/branches", params={"role": "Software Developer", "skill": "javascript"})
    body = r.json()
    required_top_level = {
        "query_role", "matched_occupation", "matched_code", "match_confidence",
        "people_observed", "evidence_level", "skill_match", "branches",
    }
    assert required_top_level.issubset(body.keys())
    assert isinstance(body["branches"], list)
    for b in body["branches"]:
        for field in ["occupation", "code", "share", "median_years", "p25_years", "p75_years", "n"]:
            assert field in b, f"Missing field '{field}' in branch"
        assert 0 <= b["share"] <= 100
        assert b["n"] >= 0


def test_top_n_respected():
    r = client.get("/api/branches", params={"role": "Software Developer", "top_n": 2})
    assert len(r.json()["branches"]) <= 2


def test_top_n_out_of_range_rejected():
    r = client.get("/api/branches", params={"role": "Software Developer", "top_n": 0})
    assert r.status_code == 422
    r = client.get("/api/branches", params={"role": "Software Developer", "top_n": 99})
    assert r.status_code == 422


def test_branches_sorted_by_share_descending():
    r = client.get("/api/branches", params={"role": "Software Developer", "top_n": 6})
    shares = [b["share"] for b in r.json()["branches"]]
    assert shares == sorted(shares, reverse=True)


# ===========================================================================
# 6. DATA INTEGRITY SWEEP — validates the ENTIRE real dataset, not just
#    the handful of roles we've manually spot-checked. This is the test
#    most likely to catch a silent pipeline bug.
# ===========================================================================

def test_no_negative_years_anywhere():
    assert (_stats["median_years"] >= 0).all(), "Negative transition time found — overlap bug may have resurfaced"
    assert (_stats["p25_years"] >= 0).all()
    assert (_stats["p75_years"] >= 0).all()


def test_p25_never_exceeds_p75():
    bad = _stats[_stats["p25_years"] > _stats["p75_years"]]
    assert bad.empty, f"{len(bad)} rows have p25 > p75 — percentile calculation bug"


def test_shares_are_valid_percentages():
    assert (_stats["observed_transition_share"] >= 0).all()
    assert (_stats["observed_transition_share"] <= 1).all(), (
        "observed_transition_share should be a 0-1 fraction before the "
        "endpoint multiplies by 100 — found a value > 1"
    )


def test_numerator_never_exceeds_denominator():
    bad = _stats[_stats["people_a_to_b"] > _stats["people_out_of_a"]]
    assert bad.empty, f"{len(bad)} rows have more people_a_to_b than people_out_of_a — impossible"


def test_no_self_transitions():
    """A transition from an occupation to itself shouldn't exist — the
    pipeline's collapse-consecutive-identical step should have removed these."""
    bad = _stats[_stats["code_a"] == _stats["code_b"]]
    assert bad.empty, f"{len(bad)} self-transition rows found — collapsing logic may have a bug"
