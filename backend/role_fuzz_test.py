"""
Career What-If Simulator — large-scale role-matching stress test
====================================================================
Two kinds of testing, combined, to get real scale (hundreds-low
thousands of cases) instead of a handful of hand-picked examples:

PART A — GROUND-TRUTH SAMPLING (precise pass/fail, not just "didn't crash")
    Pull N real occupation labels straight from your actual dataset,
    generate exact / title-case / typo variants of each, and verify the
    API returns the CORRECT matched_code every time. We know the right
    answer for these, so failures here are unambiguous bugs.

PART B — COLLOQUIAL FUZZING (realistic messy input, heuristic review)
    A curated list of real-world phrasings across MANY fields (not just
    tech), each expanded into several typo/case/whitespace variants.
    No single ground truth exists for these, so instead of a hard
    pass/fail, every 200 response is checked for word-overlap between
    the query and the matched occupation — a cheap, effective heuristic
    for catching leather-goods-style false positives automatically,
    without you having to manually read every result.

RUN:
    pip install pandas
    python3 role_fuzz_test.py

Needs backend_main.py and the real transition_stats_full.json in the
same folder — imports the app directly (FastAPI TestClient), no need
to have uvicorn running separately.
"""

import re
import random
import string
import pandas as pd
from fastapi.testclient import TestClient

from backend_main import app, _stats, ROLE_ALIASES

client = TestClient(app)
random.seed(42)

STOPWORDS = {"a", "an", "the", "of", "and", "or", "for", "to", "in", "on"}


def tokenize(s):
    return set(w for w in re.findall(r"[a-zA-Z]+", s.lower())
               if w not in STOPWORDS and len(w) > 2)


def generate_variants(s, n=6):
    """Produce case/whitespace/typo variants of a base string."""
    variants = {s.upper(), s.title(), s.lower(), "  " + s + "  "}
    chars = list(s)
    attempts = 0
    while len(variants) < n + 4 and attempts < 60 and len(chars) >= 4:
        attempts += 1
        op = random.choice(["swap", "delete", "dup", "sub"])
        i = random.randint(1, len(chars) - 2)
        c = chars[:]
        if op == "swap" and i < len(c) - 1:
            c[i], c[i + 1] = c[i + 1], c[i]
        elif op == "delete":
            del c[i]
        elif op == "dup":
            c.insert(i, c[i])
        elif op == "sub":
            c[i] = random.choice(string.ascii_lowercase)
        variants.add("".join(c))
    return list(variants)[: n + 4]


# ===========================================================================
# PART A — ground-truth sampling from the real dataset
# ===========================================================================
def run_ground_truth_sweep(n_samples=250, variants_per_label=3):
    print("=" * 70)
    print(f"PART A — GROUND TRUTH: {n_samples} real labels x variants")
    print("=" * 70)

    pool = _stats[["code_a", "label_a"]].drop_duplicates()
    sample = pool.sample(n=min(n_samples, len(pool)), random_state=42)

    results = []
    for _, row in sample.iterrows():
        expected_code = row["code_a"]
        label = row["label_a"]
        if not isinstance(label, str) or not label.strip():
            continue
        queries = [label, label.title()] + generate_variants(label, n=variants_per_label)
        for q in queries[: variants_per_label + 2]:
            try:
                r = client.get("/api/branches", params={"role": q})
            except Exception as e:
                results.append({"query": q, "expected": expected_code,
                                 "status": "CRASH", "detail": str(e)})
                continue
            if r.status_code == 200:
                got = r.json()["matched_code"]
                results.append({
                    "query": q, "expected": expected_code, "got": got,
                    "status": "PASS" if got == expected_code else "WRONG_MATCH",
                })
            elif r.status_code == 404:
                results.append({"query": q, "expected": expected_code,
                                 "status": "404_UNEXPECTED"})  # we know this role exists!
            else:
                results.append({"query": q, "expected": expected_code,
                                 "status": f"HTTP_{r.status_code}"})

    df = pd.DataFrame(results)
    print(f"\nTotal ground-truth test cases: {len(df)}")
    print(df["status"].value_counts().to_string())

    wrong = df[df["status"] == "WRONG_MATCH"]
    if len(wrong):
        print(f"\n⚠️  {len(wrong)} WRONG MATCHES — real bugs, not heuristic guesses:")
        print(wrong.to_string(index=False))

    crashes = df[df["status"] == "CRASH"]
    if len(crashes):
        print(f"\n🔥 {len(crashes)} CRASHES:")
        print(crashes.to_string(index=False))

    df.to_csv("fuzz_ground_truth_results.csv", index=False)
    return df


# ===========================================================================
# PART B — colloquial real-world phrasings, heuristic review
# ===========================================================================
BASE_ROLES = [
    # tech
    "software developer", "full stack developer", "fullstack developer",
    "backend engineer", "frontend developer", "data scientist", "data analyst",
    "product manager", "ux designer", "devops engineer", "qa engineer",
    "business analyst", "web developer", "machine learning engineer",
    # broad / non-tech — real high-evidence occupations in the dataset
    "administrative assistant", "sales assistant", "shop assistant",
    "warehouse worker", "cashier", "kitchen assistant", "waiter",
    "receptionist", "call centre agent", "accounting assistant",
    "customer service representative", "secretary", "teacher", "nurse",
    "accountant", "marketing assistant", "hr assistant", "project manager",
    "operations manager", "graphic designer", "social media manager",
    # deliberately odd/ambiguous — things that SHOULD probably 404 or be
    # treated cautiously
    "chief happiness officer", "blockchain evangelist", "ninja rockstar developer",
]


def run_colloquial_fuzz(variants_per_base=12):
    print("\n" + "=" * 70)
    print(f"PART B — COLLOQUIAL FUZZ: {len(BASE_ROLES)} base roles x ~{variants_per_base} variants")
    print("=" * 70)

    results = []
    for base in BASE_ROLES:
        queries = {base} | set(generate_variants(base, n=variants_per_base))
        for q in queries:
            try:
                r = client.get("/api/branches", params={"role": q})
            except Exception as e:
                results.append({"query": q, "base": base, "status": "CRASH", "detail": str(e)})
                continue
            if r.status_code == 404:
                results.append({"query": q, "base": base, "status": "404_honest_reject"})
            elif r.status_code == 200:
                body = r.json()
                matched = body["matched_occupation"]
                overlap = tokenize(q) & tokenize(matched)
                is_known_alias = base.lower() in ROLE_ALIASES
                suspicious = (len(overlap) == 0) and not is_known_alias
                results.append({
                    "query": q, "base": base, "status": "200",
                    "matched": matched, "confidence": body["match_confidence"],
                    "evidence": body["evidence_level"],
                    "suspicious_no_overlap": suspicious,
                })
            else:
                results.append({"query": q, "base": base, "status": f"HTTP_{r.status_code}"})

    df = pd.DataFrame(results)
    print(f"\nTotal colloquial fuzz test cases: {len(df)}")
    print(df["status"].value_counts().to_string())

    sus = df[df.get("suspicious_no_overlap", False) == True]
    print(f"\n⚠️  {len(sus)} SUSPICIOUS matches (zero word overlap with query) — "
          f"review these by hand, likely false positives:")
    if len(sus):
        print(sus[["query", "base", "matched", "confidence"]].head(40).to_string(index=False))

    df.to_csv("fuzz_colloquial_results.csv", index=False)
    return df


if __name__ == "__main__":
    gt_df = run_ground_truth_sweep(n_samples=250, variants_per_label=3)
    col_df = run_colloquial_fuzz(variants_per_base=12)

    print("\n" + "=" * 70)
    print("OVERALL SUMMARY")
    print("=" * 70)
    total = len(gt_df) + len(col_df)
    print(f"Total test cases run: {total:,}")
    print(f"Full results: fuzz_ground_truth_results.csv, fuzz_colloquial_results.csv")
    print(f"\nIf WRONG_MATCH or 404_UNEXPECTED counts in Part A are non-zero, "
          f"those are confirmed bugs — fix before the demo.")
    print(f"If suspicious count in Part B is high, review that CSV by hand "
          f"and add clear false positives to ROLE_ALIASES or investigate "
          f"the match threshold.")
