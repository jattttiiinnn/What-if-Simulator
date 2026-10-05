import requests

roles = [
    "software engineer",
    "data scientist",
    "frontend developer",
    "backend engineer",
    "ux designer",
    "product manager",
    "business analyst",
    "devops engineer",
    "qa engineer",
    "machine learning engineer",
]

for role in roles:
    r = requests.get(
        "http://127.0.0.1:8000/api/branches",
        params={"role": role},
    )

    print(f"\n=== {role} ===")

    if r.status_code == 200:
        d = r.json()
        print(
            f"-> {d.get('matched_occupation')} "
            f"(confidence {d.get('match_confidence')}, "
            f"evidence {d.get('evidence_level')})"
        )
    else:
        print(f"HTTP {r.status_code}: {r.text}")