#!/usr/bin/env node
/**
 * YOUR FILES SURVIVE THE UPDATE — WITHOUT YOU DOING ANYTHING.
 *
 * «هذه ليش كل مرة لازم احطها على البورشال.. بدي طريقة ما احطها ولا مرة».
 * He was right to be angry. He was being asked to hand-copy his uploads to a
 * backup folder and hand-copy them back around every `git pull`, forever,
 * because one push had swept ten private screenshots into the repository and
 * the cleanup commit that removed them would remove them from HIS disk too.
 *
 * A safety step a human has to remember is not a safety step. This is that
 * step, done by the machine, on every update, whether or not anyone remembers.
 *
 * The whole thing rests on one exact fact: GIT CAN ONLY DELETE FILES IT
 * TRACKS. An untracked file — and every ignored file is untracked — is
 * invisible to `pull`, to `reset --hard`, to `checkout`. So the guard does not
 * copy your uploads folder every time (it could be gigabytes). It asks git
 * which of your protected files it is holding, and copies only those. On a
 * healthy repository the answer is "none", the snapshot is empty, and the
 * update costs nothing.
 *
 * Run as:
 *   node scripts/joe-data-guard.js snapshot   (before the pull)
 *   node scripts/joe-data-guard.js restore    (after the pull)
 *
 * Deliberately dependency-free and platform-neutral: the same file runs on his
 * Windows machine and in the test that proves it works.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

/**
 * What must never disappear.
 *
 *  - `uploads`, `api/uploads` — the files he attached to Joe. The reason this
 *    guard exists.
 *  - `data` — sessions, messages, memory: Joe's whole local persistence in
 *    JSON mode.
 *  - the secrets — untracked, so git will not remove them, but they are a few
 *    hundred bytes and losing them costs him an afternoon of re-entering keys.
 *    Cheap insurance against a stray `git clean -fdx`.
 */
const PROTECTED_DIRS = ['uploads', 'api/uploads', 'data'];
const PROTECTED_FILES = ['api/.env', '.env', 'joe-secrets.ps1', 'web/.env.local'];

const repoRoot = path.resolve(__dirname, '..');

/** One vault per checkout, and OUTSIDE the checkout so `git clean` cannot reach it. */
function vaultDir() {
    const tag = Buffer.from(repoRoot).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-16);
    return path.join(os.homedir(), '.joe-data-guard', tag || 'default');
}

function git(args) {
    try {
        return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return '';
    }
}

/**
 * The files at risk: the ones git is holding inside a protected folder.
 * Anything else in there is untracked, and git will not touch it.
 */
function trackedInsideProtectedDirs() {
    const out = git(['ls-files', '-z', '--', ...PROTECTED_DIRS]);
    return out.split('\0').map(s => s.trim()).filter(Boolean);
}

function existingProtectedFiles() {
    return PROTECTED_FILES.filter(rel => {
        try { return fs.statSync(path.join(repoRoot, rel)).isFile(); } catch { return false; }
    });
}

function copyFile(rel, fromRoot, toRoot) {
    const src = path.join(fromRoot, rel);
    const dst = path.join(toRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

function snapshot() {
    const vault = vaultDir();
    const files = [...trackedInsideProtectedDirs(), ...existingProtectedFiles()];
    // A fresh vault every run: a stale entry would "restore" a file the user
    // deleted on purpose, which is its own kind of data loss.
    fs.rmSync(vault, { recursive: true, force: true });
    fs.mkdirSync(vault, { recursive: true });

    const kept = [];
    for (const rel of files) {
        try { copyFile(rel, repoRoot, vault); kept.push(rel); } catch { /* unreadable file is not worth failing the update */ }
    }
    fs.writeFileSync(path.join(vault, 'manifest.json'),
        JSON.stringify({ at: Date.now(), repoRoot, files: kept }, null, 2));

    if (!kept.length) {
        console.log('[data-guard] لا شيء من ملفاتك تحت سيطرة git — التحديث لا يمكنه المساس بها.');
    } else {
        console.log(`[data-guard] حفظتُ ${kept.length} ملفاً من ملفاتك قبل التحديث.`);
    }
    return kept.length;
}

function restore() {
    const vault = vaultDir();
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(path.join(vault, 'manifest.json'), 'utf-8'));
    } catch {
        return 0;   // nothing was ever at risk
    }
    let back = 0;
    for (const rel of manifest.files || []) {
        const live = path.join(repoRoot, rel);
        // Only what VANISHED. A file the update legitimately changed, or one the
        // user replaced with a newer version, is left exactly as it is.
        if (fs.existsSync(live)) continue;
        try { copyFile(rel, vault, repoRoot); back++; } catch { /* keep going */ }
    }
    if (back > 0) console.log(`[data-guard] أعدتُ ${back} ملفاً من ملفاتك التي كان التحديث سيحذفها.`);
    return back;
}

const mode = String(process.argv[2] || '').trim();
if (mode === 'snapshot') snapshot();
else if (mode === 'restore') restore();
else {
    console.error('usage: node scripts/joe-data-guard.js snapshot|restore');
    process.exit(2);
}

module.exports = { snapshot, restore, vaultDir, PROTECTED_DIRS, PROTECTED_FILES };
