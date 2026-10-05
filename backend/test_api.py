"""
Career What-If Simulator — backend test script
=================================================
Run this AFTER starting the backend:
    uvicorn backend_main:app --reload --port 8000

Then, in a separate terminal:
    pip install requests pandas
    python3 test_api.py

What it does:
  1. Sanity checks — health, an exact match, a typo, garbage input
  2. A FULL COVERAGE REPORT — queries every real starting occupation in
     your dataset and tallies how many get "strong" vs "limited" vs "none"
     evidence. This is the number we actually need: how broad is "works
     for any profession" once real data is behind it.
"""

import requests
import pandas as pd
import json
import sys

BASE = "http://127.0.0.1:8000"
STATS_FILE = "transition_stats_full.json"  # same file the backend loads


def sanity_checks():
    print("=" * 70)
    print("SANITY CHECKS")
    print("=" * 70)

    r = requests.get(f"{BASE}/api/health")
    print(f"\n[health] {r.status_code}: {r.json()}")

    tests = [
        ("Software Developer", "exact match, real title"),
        ("sofware developr", "typo — should still fuzzy-match"),
        ("full stack developer", "common phrasing — may or may not exist as its own ESCO code"),
        ("asdkjaslkdj nonsense", "garbage — should 404, not fake a match"),
        ("", "empty string — should error cleanly, not crash"),
    ]
    for role, note in tests:
        try:
            r = requests.get(f"{BASE}/api/branches", params={"role": role}, timeout=10)
            print(f"\n[{role!r}] ({note})")
            print(f"  status: {r.status_code}")
            if r.status_code == 200:
                d = r.json()
                print(f"  matched: {d['matched_occupation']} (code {d['matched_code']}, "
                      f"confidence {d['match_confidence']})")
                print(f"  evidence: {d['evidence_level']}, people_observed: {d['people_observed']}")
                print(f"  branches: {len(d['branches'])}")
            else:
                print(f"  response: {r.json()}")
        except Exception as e:
            print(f"  ERROR: {e}")


def coverage_report():
    print("\n" + "=" * 70)
    print("FULL COVERAGE REPORT")
    print("=" * 70)

    try:
        stats = pd.read_json(STATS_FILE)
    except FileNotFoundError:
        print(f"\nCan't find {STATS_FILE} in this folder — run this script from the "
              f"same directory as the backend, or edit STATS_FILE above.")
        sys.exit(1)

    occupations = stats[["code_a", "label_a"]].drop_duplicates()
    print(f"\nDataset contains {len(occupations):,} distinct starting occupations.")
    print("Querying the live API for every one of them (this may take a bit)...\n")

    results = []
    for _, row in occupations.iterrows():
        try:
            r = requests.get(f"{BASE}/api/branches", params={"role": row["label_a"]}, timeout=10)
            if r.status_code == 200:
                d = r.json()
                results.append({
                    "occupation": row["label_a"],
                    "code": row["code_a"],
                    "evidence_level": d["evidence_level"],
                    "people_observed": d["people_observed"],
                })
        except Exception:
            continue

    df = pd.DataFrame(results)
    if df.empty:
        print("No results came back — is the server running on the expected port?")
        return

    print("EVIDENCE LEVEL BREAKDOWN:")
    counts = df["evidence_level"].value_counts()
    total = len(df)
    for level in ["strong", "limited", "none"]:
        n = counts.get(level, 0)
        print(f"  {level:10s}: {n:5,} occupations ({n/total*100:.1f}%)")

    print(f"\nTOP 20 OCCUPATIONS BY SAMPLE SIZE (your best candidates for a "
          f"second/third demo scenario, or for expanding ProfileInput's "
          f"sample chips):")
    top20 = df[df["evidence_level"] == "strong"].sort_values(
        "people_observed", ascending=False
    ).head(20)
    print(top20.to_string(index=False))

    df.to_csv("coverage_report.csv", index=False)
    print(f"\nFull results written to coverage_report.csv ({len(df):,} rows) — "
          f"open this to browse every occupation's evidence level.")


if __name__ == "__main__":
    sanity_checks()
    coverage_report()
