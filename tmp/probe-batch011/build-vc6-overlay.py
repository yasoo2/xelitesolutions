"""vc6 overlay builder (read-only toward NVIDIA tree).
Base = git archive of NVIDIA a10c71ab (api/ subtree) into Muse workspace.
Overlay = FULL dirty api/src snapshot (tracked-dirty + untracked .ts) copied
read-only for measurement only (vc4 precedent). Nothing is written back.
Writes manifest.json with sha256 per overlaid file.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile

NV = 'D:/Joe/xelitesolutions'
BASE_SHA = 'a10c71ab14411e682be7a7e4e5ffd07467d960ac'
DEST = 'D:/Joe/muse-worktree/tmp/probe-batch011/vc6-tree'
ARCHIVE = 'D:/Joe/muse-worktree/tmp/probe-batch011/vc6-a10-api.zip'


def git(*args):
    cmd = ['git', '-c', 'safe.directory=%s' % NV, '-C', NV] + list(args)
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        print('GIT_FAIL', args, out.stderr[:400])
        sys.exit(1)
    return out.stdout


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    if os.path.exists(DEST):
        print('DEST_EXISTS_REFUSING', DEST)
        sys.exit(1)
    os.makedirs(DEST)
    print('ARCHIVING', BASE_SHA)
    git('archive', '-o', ARCHIVE, BASE_SHA, 'api')
    with zipfile.ZipFile(ARCHIVE) as zf:
        zf.extractall(DEST)
    print('ARCHIVE_EXTRACTED')

    manifest = {'base': BASE_SHA, 'files': {}}
    dirty = [l.strip() for l in git('diff', 'HEAD', '--name-only', '--', 'api/src').splitlines() if l.strip()]
    untracked_all = [l.strip() for l in git('ls-files', '--others', '--exclude-standard', '--', 'api').splitlines() if l.strip()]
    untracked = [p for p in untracked_all if p.endswith('.ts')]
    print('DIRTY_TRACKED_SRC=', len(dirty))
    print('UNTRACKED_TS=', len(untracked))
    for rel in dirty + untracked:
        src = os.path.join(NV, rel.replace('/', os.sep))
        dst = os.path.join(DEST, rel.replace('/', os.sep))
        if not os.path.isfile(src):
            print('MISSING_SRC_SKIPPED', rel)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        manifest['files'][rel] = {
            'sha256': sha256_file(dst),
            'bytes': os.path.getsize(dst),
            'kind': 'dirty-tracked' if rel in dirty else 'untracked',
        }
    with open(os.path.join(DEST, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    print('MANIFEST_FILES=', len(manifest['files']))
    for key in ['api/src/modules/tools/definitions/ImageGenerationTool.ts',
                'api/src/modules/tools/definitions/BulkFileGeneratorTool.ts',
                'api/src/modules/tools/definitions/VisualQATool.ts',
                'api/src/core/llm/provider-continuity.ts']:
        full = os.path.join(DEST, key.replace('/', os.sep))
        if os.path.isfile(full):
            print('PIN', key, sha256_file(full)[:16])


if __name__ == '__main__':
    main()
