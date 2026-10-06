"""
Pinpoints exactly which input resolves to which real occupation, with
confidence score — run this to get the exact role -> match pairing
instead of guessing from the batch test's deduplicated label list.
"""
from backend_main import match_role

ROLES_TO_CHECK = [
    "software developer", "web developer", "ict application developer",
    "software analyst", "software engineer", "data scientist", "data analyst",
    "product manager", "ux designer", "business analyst", "devops engineer",
    "qa engineer", "backend developer", "frontend developer",
]

print(f"{'INPUT':<28} {'MATCHED':<35} {'CODE':<12} {'CONFIDENCE':<10}")
print("-" * 90)
for role in ROLES_TO_CHECK:
    label, code, score = match_role(role)
    flag = "  <-- CHECK THIS" if label and role.split()[0].lower() not in label.lower() else ""
    print(f"{role:<28} {str(label):<35} {str(code):<12} {score:<10}{flag}")
