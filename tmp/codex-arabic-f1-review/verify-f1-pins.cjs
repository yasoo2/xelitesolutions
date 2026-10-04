// Independent F1 byte verification (Muse). Read-only wrt candidate tree.
// 1. Hash 8 files, compare to candidate-arabic-f1-source.json pins.
// 2. Reconstruction: current requested-action.ts minus the two `وصف\s+فقط|`
//    insertions must equal pre-F1 bytes (hash 3BCF65EF...); current arabic test
//    minus the one new case line must equal pre-F1 bytes (hash F7B333D1...).
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const BASE = 'D:\\Joe\\worktrees\\codex-readonly-browser-20261004';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();

const pins = JSON.parse(fs.readFileSync(path.join(BASE, 'tmp/browser-contract-baseline/candidate-arabic-f1-source.json'), 'utf8'));
let pinOk = 0;
for (const p of pins) {
  const buf = fs.readFileSync(path.join(BASE, p.File));
  const h = sha256(buf);
  const ok = h === p.SHA256.toUpperCase();
  if (ok) pinOk++;
  console.log((ok ? 'PIN_OK  ' : 'PIN_FAIL') + ' ' + p.File + ' ' + h.slice(0, 16));
}
console.log('PINS ' + pinOk + '/' + pins.length);

// Reconstruction check for requested-action.ts
const raPath = path.join(BASE, 'api/src/core/intelligence/requested-action.ts');
const raBuf = fs.readFileSync(raPath);
const raText = raBuf.toString('utf8');
const needle = 'وصف\\s+فقط|';
const occurrences = raText.split(needle).length - 1;
console.log('WASF_INSERT_OCCURRENCES=' + occurrences);
const reconstructed = raText.split(needle).join('');
const reconHash = sha256(Buffer.from(reconstructed, 'utf8'));
const preF1 = '3BCF65EFA05FDA8D22BF8B166EEBAA123775200E76C6AC6A2A3FFB80B390F9C1';
console.log('RECON_HASH=' + reconHash);
console.log('RECON_MATCH_PRE_F1=' + (reconHash === preF1));

// Reconstruction check for the arabic test file (remove exactly the new case line)
const tPath = path.join(BASE, 'api/src/__tests__/arabic-authority-constraints.test.ts');
const tBuf = fs.readFileSync(tPath);
const tText = tBuf.toString('utf8');
const caseLine = "        'وصف فقط ثم ابني متجر',";
const caseOcc = tText.split(caseLine).length - 1;
console.log('NEWCASE_OCCURRENCES=' + caseOcc);
// Remove the line including its line terminator (detect CRLF vs LF)
let tRecon = tText;
if (tText.includes(caseLine + '\r\n')) tRecon = tText.split(caseLine + '\r\n').join('');
else tRecon = tText.split(caseLine + '\n').join('');
const tReconHash = sha256(Buffer.from(tRecon, 'utf8'));
const preF1Test = 'F7B333D15CCD5A169FFA883E4893B35DC6C830B80AF234AE6EE04B0B2B5629F2';
console.log('TEST_RECON_HASH=' + tReconHash);
console.log('TEST_RECON_MATCH_PRE_F1=' + (tReconHash === preF1Test));

// Confirm both explicitArabicDenial sites carry the insertion, and no other file changed vs F1 pins
const sites = (raText.match(/const explicitArabicDenial = .*وصف\\s\+فقط.*$/gm) || []).length;
console.log('GUARD_SITES_WITH_WASF=' + sites);
