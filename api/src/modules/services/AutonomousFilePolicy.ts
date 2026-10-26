import fs from 'fs';
import path from 'path';
import { redactSecretsFromString } from '../../shared/utils/redaction';
import { editAlreadyApplied } from '../../shared/utils/edit-in-place';

/** Bounded text files only. Existing files allow one unique literal edit, never a blind overwrite. */
export const AUTONOMOUS_FILE_BYTES = 128 * 1024;
export function autonomousFileTool(name: unknown): boolean {
    return name === 'read_file' || name === 'write_file' || name === 'file_edit';
}

function deny(reason: string): never { throw new Error(reason); }
/** One text policy for both physical file access and required-source intake. */
export function autonomousFileTextIsSafe(value: string, options: { allowRequirementDescriptions?: boolean } = {}): boolean {
    const intrinsicSafe = (text: string) => !text.includes('\0') && redactSecretsFromString(text) === text
        && !/\b(?:nvapi-|gsk_|AIza)[A-Za-z0-9_-]{12,}\b/u.test(text)
        && !/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)/u.test(text);
    if (!intrinsicSafe(value)) return false;
    // A length constraint supplies no password. Accept only an entire unquoted
    // description, never equals/quoted assignments or additional literal data.
    const description = /^(?:password(?:\s+(?:requirements?|policy|length))?)\s*:\s*(?:minimum(?:\s+length(?:\s+of)?)?|maximum(?:\s+length(?:\s+of)?)?|at\s+least|at\s+most)\s+(?:[0-9]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen)\s+(?:characters?|chars?|code\s*points?)\.?$/iu;
    let inspected = value;
    if (/^\s*[\[{]/u.test(value)) {
        let parsed: any;
        try { parsed = JSON.parse(value); } catch { /* Non-JSON source retains the original strict scan. */ }
        if (parsed !== undefined) {
        try {
            let nodes = 0;
            const walk = (node: any, depth = 0): any => {
                if (++nodes > 2048 || depth > 8) throw Error('bounded_metadata');
                if (typeof node === 'string' && !intrinsicSafe(node)) throw Error('decoded_secret');
                if (!node || typeof node !== 'object') return node;
                if (Array.isArray(node)) return node.map(child => walk(child, depth + 1));
                const result: Record<string, any> = Object.create(null);
                for (const [key, child] of Object.entries(node)) {
                    if (!intrinsicSafe(key)) throw Error('decoded_secret');
                    if (/^(?:api[_-]?key|password|secret|access[_-]?token)$/iu.test(key)) {
                        if (typeof child === 'string' && child.length || Array.isArray(child) && child.length) throw Error('literal_credential');
                        if (child && typeof child === 'object' && Object.entries(child).some(([name, literal]) => /^(?:default|const|enum|example|examples|value)$/iu.test(name)
                            && literal != null && literal !== '' && (!Array.isArray(literal) || literal.length > 0))) throw Error('literal_credential');
                    }
                    result[key] = /^(?:description|title|label|placeholder)$/iu.test(key) && typeof child === 'string' && description.test(child.trim())
                        ? '[password length requirement]' : walk(child, depth + 1);
                }
                return result;
            };
            inspected = JSON.stringify(walk(parsed));
        } catch { return false; }
        }
    } else if (options.allowRequirementDescriptions === true) {
        let fence: { marker: string; length: number } | undefined;
        inspected = value.split(/\r?\n/u).map(line => {
            const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u);
            if (marker) {
                if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
                else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line)) fence = undefined;
                return line;
            }
            if (!fence && /^ {0,3}(?:[-*] )?/u.test(line) && !/^(?: {4}|\t)/u.test(line)
                && description.test(line.replace(/^ {0,3}(?:[-*] )?/u, '').trim())) return '[password length requirement]';
            return line;
        }).join('\n');
    }
    return intrinsicSafe(inspected)
        && !/(?:api[_-]?key|password|secret|access[_-]?token)\s*["']?\s*[:=]\s*["']?[^\s"'{}]{6,}/iu.test(inspected);
}
function textIsSafe(value: string, targetPath?: string): boolean {
    return autonomousFileTextIsSafe(value, { allowRequirementDescriptions: /\.(?:txt|md)$/iu.test(targetPath || '') });
}

/** Read data descriptors once, before owner lookup; never execute input getters. */
export function snapshotAutonomousFileInput(name: string, input: unknown): Record<string, any> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) deny('invalid_file_input');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const allowed = new Set(name === 'file_edit'
        ? ['path', 'filename', 'filePath', 'find', 'search', 'old_string', 'replace', 'new_string', 'request']
        : ['path', 'filename', 'filePath', 'content', 'mode', 'requireExisting',
            'ensureSingleAppend', 'expectedFinalLineCount', 'startLine', 'endLine', 'request']);
    // Planner evidence metadata is read-only and never reaches the file leaf.
    if (name === 'read_file') allowed.add('expectedMarker');
    const copy: Record<string, any> = {};
    for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string' || !allowed.has(key)) deny('invalid_file_input');
        const d = descriptors[key];
        if (!('value' in d) || !d.enumerable) deny('invalid_file_input');
        if (d.value === undefined) continue;
        if (!['string', 'number', 'boolean'].includes(typeof d.value)) deny('invalid_file_input');
        copy[key] = d.value;
    }
    const candidates = ['path', 'filename', 'filePath'].filter(k => copy[k] !== undefined).map(k => copy[k]);
    if (!candidates.length || candidates.some(v => typeof v !== 'string' || v !== candidates[0])) deny('ambiguous_file_path');
    if (!candidates[0].trim() || candidates[0].length > 2048) deny('invalid_file_path');
    const result: Record<string, any> = { path: candidates[0] };
    if (copy.request !== undefined && (typeof copy.request !== 'string' || copy.request.length > 8192 || !textIsSafe(copy.request, candidates[0]))) deny('sensitive_file_input');
    if (name === 'file_edit') {
        for (const [canonical, aliases] of [['find', ['find', 'search', 'old_string']], ['replace', ['replace', 'new_string']]] as const) {
            const values = aliases.filter(k => copy[k] !== undefined).map(k => copy[k]);
            if (!values.length || values.some(v => typeof v !== 'string' || v !== values[0])) deny('ambiguous_edit_input');
            if (Buffer.byteLength(values[0]) > AUTONOMOUS_FILE_BYTES || !textIsSafe(values[0], candidates[0])) deny('sensitive_file_input');
            result[canonical] = values[0];
        }
        if (!result.find) deny('empty_edit_find');
    } else if (name === 'write_file') {
        if (typeof copy.content !== 'string' || Buffer.byteLength(copy.content) > AUTONOMOUS_FILE_BYTES) deny('file_size_limit');
        if (!textIsSafe(copy.content, candidates[0])) deny('sensitive_file_input');
        if (copy.mode !== undefined && copy.mode !== 'overwrite' && copy.mode !== 'append') deny('invalid_file_mode');
        for (const key of ['requireExisting', 'ensureSingleAppend']) {
            if (copy[key] !== undefined && typeof copy[key] !== 'boolean') deny('invalid_file_input');
        }
        if (copy.expectedFinalLineCount !== undefined && (!Number.isInteger(copy.expectedFinalLineCount)
            || copy.expectedFinalLineCount < 1 || copy.expectedFinalLineCount > 10000)) deny('invalid_file_input');
        Object.assign(result, { content: copy.content, mode: copy.mode ?? 'overwrite',
            requireExisting: copy.requireExisting, ensureSingleAppend: copy.ensureSingleAppend,
            expectedFinalLineCount: copy.expectedFinalLineCount });
    } else {
        if (copy.expectedMarker !== undefined && (typeof copy.expectedMarker !== 'string'
            || copy.expectedMarker.length > 1024 || !textIsSafe(copy.expectedMarker, candidates[0]))) deny('sensitive_file_input');
        if (copy.content !== undefined || copy.mode !== undefined || copy.requireExisting !== undefined
            || copy.ensureSingleAppend !== undefined || copy.expectedFinalLineCount !== undefined) deny('invalid_file_input');
        for (const key of ['startLine', 'endLine']) {
            if (copy[key] !== undefined && (!Number.isInteger(copy[key]) || copy[key] < 1 || copy[key] > 10000)) deny('invalid_file_input');
            if (copy[key] !== undefined) result[key] = copy[key];
        }
        if ((result.endLine ?? 1000) < (result.startLine ?? 1)) deny('invalid_file_input');
    }
    return Object.freeze(result);
}

function within(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return !!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Synchronous physical checks are repeated immediately before the synchronous leaf. */
export function validateAutonomousFileOperation(name: string, input: Record<string, any>, rootValue: string,
    externalRoot: string, expectedEditContent?: string): Record<string, any> {
    if (typeof rootValue !== 'string' || !path.isAbsolute(rootValue)) deny('workspace_root_invalid');
    const root = path.resolve(rootValue);
    if (root === path.parse(root).root || root.toLowerCase() === path.resolve(externalRoot).toLowerCase()) deny('workspace_root_invalid');
    const raw = input.path;
    if (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/u.test(raw) || /^[\\/]{2}/u.test(raw)) deny('invalid_file_path');
    const segments = raw.replace(/\\/g, '/').replace(/^[A-Za-z]:\//u, '').split('/');
    if (segments.some(s => s === '..' || /[.: ]$/u.test(s) || s.includes(':')
        || /^(?:\.env(?:\..*)?|\.git|\.ssh|\.joe[^/]*|node_modules|credentials?(?:\..*)?|secrets?(?:\..*)?|auth(?:\..*)?|id_(?:rsa|ed25519)|(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?)$/iu.test(s)
        || /\.(?:pem|key|pfx|p12|kdbx)$/iu.test(s))) deny('sensitive_or_invalid_path');
    const target = path.resolve(root, raw);
    if (!within(root, target)) deny('path_outside_workspace');
    let cursor = path.parse(target).root;
    let targetStat: fs.Stats | undefined;
    for (const segment of target.slice(cursor.length).split(path.sep)) {
        cursor = path.join(cursor, segment);
        let stat: fs.Stats;
        try { stat = fs.lstatSync(cursor); }
        catch (error: any) {
            if (error?.code !== 'ENOENT') deny('file_access_failed');
            if (cursor === root || !within(root, cursor)) deny('workspace_root_invalid');
            continue;
        }
        if (stat.isSymbolicLink()) deny('linked_file_path');
        if (cursor !== target && !stat.isDirectory()) deny('invalid_file_parent');
        if (cursor === target) targetStat = stat;
    }
    if (targetStat && (!targetStat.isFile() || targetStat.nlink !== 1)) deny('invalid_file_target');
    if (targetStat && targetStat.size > AUTONOMOUS_FILE_BYTES) deny('file_size_limit');
    if (!targetStat && (name === 'read_file' || name === 'file_edit' || input.mode === 'append' || input.requireExisting === true)) deny('file_not_found');
    if (targetStat && name === 'write_file' && input.mode !== 'append') deny('existing_file_preserved');
    if (targetStat) {
        const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile() || stat.nlink !== 1 || stat.size > AUTONOMOUS_FILE_BYTES) deny('invalid_file_target');
            const buffer = Buffer.alloc(AUTONOMOUS_FILE_BYTES + 1);
            const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
            if (length > AUTONOMOUS_FILE_BYTES) deny('file_size_limit');
            const bytes = buffer.subarray(0, length), content = bytes.toString('utf8');
            if (!Buffer.from(content, 'utf8').equals(bytes) || !textIsSafe(content, target)) deny('sensitive_or_binary_file');
            if (name === 'write_file' && length + Buffer.byteLength(input.content) + 2 > AUTONOMOUS_FILE_BYTES) deny('file_size_limit');
            if (name === 'file_edit') {
                if (expectedEditContent !== undefined && expectedEditContent !== content) deny('file_changed');
                const crlf = (content.match(/\r\n/g) || []).length, lf = (content.match(/(?<!\r)\n/g) || []).length;
                const newline = crlf > lf ? '\r\n' : '\n';
                const normalize = (value: string) => value.replace(/\r\n|\r|\n/g, newline);
                const find = normalize(input.find), replace = normalize(input.replace);
                // An edit already in place is prepared as no change, never applied twice.
                if (editAlreadyApplied(content, find, replace)) return { path: target, find: input.find, replace: input.replace,
                    autonomousEditBefore: content, autonomousEditAfter: content };
                const offset = content.indexOf(find);
                if (offset < 0) deny('edit_text_not_found');
                if (content.indexOf(find, offset + 1) >= 0) deny('ambiguous_edit_match');
                // Slicing keeps dollar replacement tokens literal and preserves all unrelated bytes.
                const after = content.slice(0, offset) + replace + content.slice(offset + find.length);
                if (Buffer.byteLength(after) > AUTONOMOUS_FILE_BYTES) deny('file_size_limit');
                if (!textIsSafe(after, target)) deny('sensitive_file_result');
                return { path: target, find: input.find, replace: input.replace,
                    autonomousEditBefore: content, autonomousEditAfter: after };
            }
        } finally { fs.closeSync(fd); }
    }
    return { ...input, path: target, ...(name === 'write_file' ? { createOnly: input.mode !== 'append' } : {}) };
}
