# """
# Career What-If Simulator — batch role x skill test
# ======================================================
# Tests every real role (sampled from your dataset) against every skill in
# SKILL_MAP, plus a few unknown skills, in one run — instead of clicking
# through combinations one at a time in the browser.

# Specifically built to catch the exact bug class found manually (Warehouse
# Worker + requirements -> "software analyst" at 0.00%, n=1, wrongly shown
# as a matched result): any response with skill_match == "matched" is
# automatically checked to confirm every branch has real sample size behind
# it. This is a regression test for that fix, run at scale.

# RUN:
#     python3 skill_match_batch_test.py

# Needs backend_main.py and the real transition_stats_full.json in the
# same folder.
# """

# import pandas as pd
# from fastapi.testclient import TestClient

# from backend_main import app, _stats, SKILL_MAP, MIN_PEOPLE_FOR_SKILL_MATCH

# client = TestClient(app)

# N_ROLES_TO_SAMPLE = 60          # real roles pulled from the dataset
# UNKNOWN_SKILLS_TO_TEST = ["excel", "customer service", "cooking", "photography"]


# def sample_roles(n):
#     """Mix of your biggest-sample roles (most likely to come up in a real
#     demo) and a random spread across the rest of the dataset."""
#     pool = _stats[["code_a", "label_a", "people_out_of_a"]].drop_duplicates()
#     top = pool.sort_values("people_out_of_a", ascending=False).head(n // 2)
#     rest = pool.drop(top.index).sample(n=min(n - len(top), len(pool) - len(top)), random_state=7)
#     return pd.concat([top, rest])["label_a"].tolist()


# def run_batch():
#     roles = sample_roles(N_ROLES_TO_SAMPLE)
#     all_skills = list(SKILL_MAP.keys()) + UNKNOWN_SKILLS_TO_TEST + [None]  # None = no skill

#     print(f"Testing {len(roles)} roles x {len(all_skills)} skill conditions "
#           f"= {len(roles) * len(all_skills)} combinations...\n")

#     results = []
#     violations = []

#     for role in roles:
#         for skill in all_skills:
#             params = {"role": role}
#             if skill is not None:
#                 params["skill"] = skill

#             try:
#                 r = client.get("/api/branches", params=params)
#             except Exception as e:
#                 results.append({"role": role, "skill": skill, "status": "CRASH", "detail": str(e)})
#                 continue

#             if r.status_code != 200:
#                 results.append({"role": role, "skill": skill, "status": f"HTTP_{r.status_code}"})
#                 continue

#             body = r.json()
#             row = {
#                 "role": role, "skill": skill, "status": "200",
#                 "skill_match": body["skill_match"],
#                 "evidence_level": body["evidence_level"],
#                 "n_branches": len(body["branches"]),
#             }
#             results.append(row)

#             # THE ACTUAL REGRESSION CHECK: if skill_match says "matched",
#             # every branch shown must be backed by real sample size —
#             # this is exactly the bug class that slipped through before.
#             if body["skill_match"] == "matched":
#                 for b in body["branches"]:
#                     if b["n"] < MIN_PEOPLE_FOR_SKILL_MATCH:
#                         violations.append({
#                             "role": role, "skill": skill,
#                             "occupation": b["occupation"], "n": b["n"],
#                             "share": b["share"],
#                             "issue": f"matched with only {b['n']} people "
#                                      f"(below MIN_PEOPLE_FOR_SKILL_MATCH="
#                                      f"{MIN_PEOPLE_FOR_SKILL_MATCH})",
#                         })
#                     if b["share"] == 0.0:
#                         violations.append({
#                             "role": role, "skill": skill,
#                             "occupation": b["occupation"], "n": b["n"],
#                             "share": b["share"],
#                             "issue": "matched with 0.00% share — meaningless result shown as real",
#                         })

#     df = pd.DataFrame(results)
#     print("=" * 70)
#     print("RESULTS SUMMARY")
#     print("=" * 70)
#     print(f"Total combinations tested: {len(df)}")
#     print(f"\nStatus breakdown:\n{df['status'].value_counts().to_string()}")

#     ok = df[df["status"] == "200"]
#     print(f"\nEvidence level breakdown (of successful responses):"
#           f"\n{ok['evidence_level'].value_counts().to_string()}")
#     print(f"\nSkill match breakdown:\n{ok['skill_match'].value_counts(dropna=False).to_string()}")

#     print("\n" + "=" * 70)
#     if violations:
#         print(f"🔴 {len(violations)} REGRESSION VIOLATIONS FOUND — the bug "
#               f"class is NOT fully fixed:")
#         print("=" * 70)
#         vdf = pd.DataFrame(violations)
#         print(vdf.to_string(index=False))
#         vdf.to_csv("skill_match_violations.csv", index=False)
#     else:
#         print(f"✅ ZERO violations — every 'matched' skill result across "
#               f"{len(ok)} successful responses has real sample size behind "
#               f"it. The near-zero-evidence bug is confirmed fixed at scale, "
#               f"not just for the one manually-found case.")
#         print("=" * 70)

#     df.to_csv("skill_match_batch_results.csv", index=False)
#     print(f"\nFull results: skill_match_batch_results.csv")


# if __name__ == "__main__":
#     run_batch()

#TEST FOR TECHNICAL ROLES
"""
Career What-If Simulator — batch role x skill test
======================================================
Tests every real role (sampled from your dataset) against every skill in
SKILL_MAP, plus a few unknown skills, in one run — instead of clicking
through combinations one at a time in the browser.

Specifically built to catch the exact bug class found manually (Warehouse
Worker + requirements -> "software analyst" at 0.00%, n=1, wrongly shown
as a matched result): any response with skill_match == "matched" is
automatically checked to confirm every branch has real sample size behind
it. This is a regression test for that fix, run at scale.

RUN:
    python3 skill_match_batch_test.py

Needs backend_main.py and the real transition_stats_full.json in the
same folder.
"""

import pandas as pd
from fastapi.testclient import TestClient

from backend_main import app, _stats, SKILL_MAP, MIN_PEOPLE_FOR_SKILL_MATCH, match_role

client = TestClient(app)

N_ROLES_TO_SAMPLE = 60          # real roles pulled from the dataset
UNKNOWN_SKILLS_TO_TEST = ["excel", "customer service", "cooking", "photography"]

# Technical roles are low-volume compared to roles like "administrative
# assistant" (27K people) or "warehouse worker" (13K), so pure
# top-by-volume + random sampling rarely includes them by chance — this
# guarantees they're always tested, since they're your actual demo
# scenario and the ones SKILL_MAP is curated around.
MUST_INCLUDE_ROLES = [
    "software developer", "web developer", "ict application developer",
    "software analyst", "software engineer", "data scientist", "data analyst",
    "product manager", "ux designer", "business analyst", "devops engineer",
    "qa engineer", "backend developer", "frontend developer",
]


def sample_roles(n):
    """Guaranteed tech roles (resolved through the real matcher, so we get
    their actual dataset label, not just the alias text) + your biggest-
    sample roles + a random spread across the rest of the dataset."""
    pool = _stats[["code_a", "label_a", "people_out_of_a"]].drop_duplicates()

    must_include_labels = set()
    for role in MUST_INCLUDE_ROLES:
        label, code, score = match_role(role)
        if label is not None:
            must_include_labels.add(label)

    must_df = pool[pool["label_a"].isin(must_include_labels)]
    remaining_n = max(0, n - len(must_df))

    rest_pool = pool.drop(must_df.index)
    top = rest_pool.sort_values("people_out_of_a", ascending=False).head(remaining_n // 2)
    rest = rest_pool.drop(top.index).sample(
        n=min(remaining_n - len(top), len(rest_pool) - len(top)), random_state=7
    )

    combined = pd.concat([must_df, top, rest]).drop_duplicates(subset=["label_a"])
    print(f"Guaranteed {len(must_df)} technical roles included: "
          f"{sorted(must_df['label_a'].unique().tolist())}\n")
    return combined["label_a"].tolist()


def run_batch():
    roles = sample_roles(N_ROLES_TO_SAMPLE)
    all_skills = list(SKILL_MAP.keys()) + UNKNOWN_SKILLS_TO_TEST + [None]  # None = no skill

    print(f"Testing {len(roles)} roles x {len(all_skills)} skill conditions "
          f"= {len(roles) * len(all_skills)} combinations...\n")

    results = []
    violations = []

    for role in roles:
        for skill in all_skills:
            params = {"role": role}
            if skill is not None:
                params["skill"] = skill

            try:
                r = client.get("/api/branches", params=params)
            except Exception as e:
                results.append({"role": role, "skill": skill, "status": "CRASH", "detail": str(e)})
                continue

            if r.status_code != 200:
                results.append({"role": role, "skill": skill, "status": f"HTTP_{r.status_code}"})
                continue

            body = r.json()
            row = {
                "role": role, "skill": skill, "status": "200",
                "skill_match": body["skill_match"],
                "evidence_level": body["evidence_level"],
                "n_branches": len(body["branches"]),
            }
            results.append(row)

            # THE ACTUAL REGRESSION CHECK: if skill_match says "matched",
            # every branch shown must be backed by real sample size —
            # this is exactly the bug class that slipped through before.
            if body["skill_match"] == "matched":
                for b in body["branches"]:
                    if b["n"] < MIN_PEOPLE_FOR_SKILL_MATCH:
                        violations.append({
                            "role": role, "skill": skill,
                            "occupation": b["occupation"], "n": b["n"],
                            "share": b["share"],
                            "issue": f"matched with only {b['n']} people "
                                     f"(below MIN_PEOPLE_FOR_SKILL_MATCH="
                                     f"{MIN_PEOPLE_FOR_SKILL_MATCH})",
                        })
                    if b["share"] == 0.0:
                        violations.append({
                            "role": role, "skill": skill,
                            "occupation": b["occupation"], "n": b["n"],
                            "share": b["share"],
                            "issue": "matched with 0.00% share — meaningless result shown as real",
                        })

    df = pd.DataFrame(results)
    print("=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    print(f"Total combinations tested: {len(df)}")
    print(f"\nStatus breakdown:\n{df['status'].value_counts().to_string()}")

    ok = df[df["status"] == "200"]
    print(f"\nEvidence level breakdown (of successful responses):"
          f"\n{ok['evidence_level'].value_counts().to_string()}")
    print(f"\nSkill match breakdown:\n{ok['skill_match'].value_counts(dropna=False).to_string()}")

    print("\n" + "=" * 70)
    if violations:
        print(f"🔴 {len(violations)} REGRESSION VIOLATIONS FOUND — the bug "
              f"class is NOT fully fixed:")
        print("=" * 70)
        vdf = pd.DataFrame(violations)
        print(vdf.to_string(index=False))
        vdf.to_csv("skill_match_violations.csv", index=False)
    else:
        print(f"✅ ZERO violations — every 'matched' skill result across "
              f"{len(ok)} successful responses has real sample size behind "
              f"it. The near-zero-evidence bug is confirmed fixed at scale, "
              f"not just for the one manually-found case.")
        print("=" * 70)

    df.to_csv("skill_match_batch_results.csv", index=False)
    print(f"\nFull results: skill_match_batch_results.csv")


if __name__ == "__main__":
    run_batch()