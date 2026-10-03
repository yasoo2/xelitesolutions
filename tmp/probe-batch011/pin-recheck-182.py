"""Cycle-182 pin recheck: compare current NVIDIA dirty bytes vs vc4 manifest.
Read-only toward D:/Joe/xelitesolutions. No writes outside this receipt."""
import hashlib
import json
import os

MANIFEST = r"D:\Joe\muse-worktree\tmp\probe-batch011\vc4-tree\manifest.json"
NV_ROOT = r"D:\Joe\xelitesolutions"

with open(MANIFEST, encoding="utf-8") as f:
    manifest = json.load(f)

print("base:", manifest.get("base"))
files = manifest.get("files", {})
match = differ = missing = 0
for rel, meta in sorted(files.items()):
    if rel.startswith("api/src/__tests__/vc4-"):
        print(f"SKIP  {rel} (muse-authored probe, not NVIDIA bytes)")
        continue
    p = os.path.join(NV_ROOT, rel.replace("/", os.sep))
    if not os.path.exists(p):
        print(f"MISSING {rel}")
        missing += 1
        continue
    with open(p, "rb") as f:
        h = hashlib.sha256(f.read()).hexdigest()
    want = meta.get("sha256", "").lower()
    if h.lower() == want:
        print(f"MATCH {rel}")
        match += 1
    else:
        print(f"DIFFER {rel}\n  manifest={want}\n  current ={h.lower()}")
        differ += 1
print(f"SUMMARY match={match} differ={differ} missing={missing} total={len(files)}")
