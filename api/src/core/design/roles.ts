/**
 * «نظام يستعمله فريق» — THE THIRD STEP OF THE PLATFORM.
 *
 * Everything Joe builds today has exactly ONE account: the owner. That is a
 * system for a person, not for a business. A nursery has a man at the counter,
 * a marketplace has vendors, a clinic has a receptionist — and none of them
 * should be handed the owner's password, because a password is not a role.
 *
 * So a built system gets three roles and no more, because a fourth one nobody
 * asked for is a menu, not a permission:
 *
 *   • المالك   (owner)  — everything, and the only one who makes accounts.
 *   • موظّف    (staff)  — writes, but only ever touches the rows HE created.
 *   • مُطّلِع  (viewer) — sees everything, changes nothing.
 *
 * The rules live HERE, once, and are compiled into the generated server, the
 * generated app and the report Joe writes about them. A permission that is
 * spelled out in three places is a permission that will disagree with itself.
 */

export type RoleKey = 'owner' | 'staff' | 'viewer';

export interface RoleSpec {
    key: RoleKey;
    /** What the owner reads on the screen. */
    ar: string;
    en: string;
    /** May create, edit and delete rows at all. */
    write: boolean;
    /** Sees and touches only the rows carrying his own id. */
    ownRowsOnly: boolean;
    /** May create accounts, change roles and remove people. */
    manageUsers: boolean;
    /** One line explaining the role to the person who hands it out. */
    noteAr: string;
    noteEn: string;
}

export const ROLES: RoleSpec[] = [
    {
        key: 'owner', ar: 'المالك', en: 'Owner',
        write: true, ownRowsOnly: false, manageUsers: true,
        noteAr: 'كل شيء: كل الصفوف، وإنشاء الحسابات وتغيير الأدوار.',
        noteEn: 'Everything: every row, plus accounts and roles.',
    },
    {
        key: 'staff', ar: 'موظّف', en: 'Staff',
        write: true, ownRowsOnly: true, manageUsers: false,
        noteAr: 'يضيف ويعدّل ويحذف صفوفه هو فقط — لا يرى صفوف غيره ولا يلمسها.',
        noteEn: 'Adds, edits and deletes only his own rows — never anyone else’s.',
    },
    {
        key: 'viewer', ar: 'مُطّلِع', en: 'Viewer',
        write: false, ownRowsOnly: false, manageUsers: false,
        noteAr: 'يرى كل شيء ولا يغيّر شيئاً — للمحاسب والمراجع.',
        noteEn: 'Sees everything, changes nothing — for an accountant or auditor.',
    },
];

/**
 * Keep the permission lattice stable while speaking the role names the user
 * requested. The privileged name maps to owner; the operational name maps to
 * staff. Unknown or ambiguous prose keeps the conservative defaults.
 */
export function rolesForRequest(requestRaw: string): RoleSpec[] {
    const request = String(requestRaw || '');
    const pair = request.match(/\b([a-z][a-z-]*)\s+and\s+([a-z][a-z-]*)\s+roles?\b/i);
    if (!pair) return ROLES.map(role => ({ ...role }));
    const names = [pair[1], pair[2]].map(name => name.toLowerCase());
    const privileged = names.find(name => /^(?:admin|administrator|manager|owner|supervisor)$/.test(name));
    const operational = names.find(name => name !== privileged);
    if (!privileged || !operational) return ROLES.map(role => ({ ...role }));
    const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
    return ROLES.map(role => role.key === 'owner'
        ? { ...role, en: title(privileged), noteEn: `${title(privileged)} access: every record, account, and role.` }
        : role.key === 'staff'
            ? { ...role, en: title(operational), noteEn: `${title(operational)} access: create and manage assigned operational records.` }
            : { ...role });
}

/** The column that says whose row this is. One name, in every table. */
export const OWNER_COLUMN = 'owner_id';

export const ROLE_KEYS: RoleKey[] = ROLES.map(r => r.key);

/** An unknown role is the LEAST privileged one, never the most. */
export function roleSpec(key: string): RoleSpec {
    return ROLES.find(r => r.key === String(key || '').toLowerCase())
        || ROLES.find(r => r.key === 'viewer')!;
}

export function canWrite(role: string): boolean { return roleSpec(role).write; }
export function ownRowsOnly(role: string): boolean { return roleSpec(role).ownRowsOnly; }
export function canManageUsers(role: string): boolean { return roleSpec(role).manageUsers; }

/** The role's own name, for a chip in the corner of the screen. */
export function roleLabel(role: string, isAr: boolean): string {
    const r = roleSpec(role);
    return isAr ? r.ar : r.en;
}

/** What Joe tells the owner in the chat once the system is built. */
export function describeRoles(isAr: boolean, roles: RoleSpec[] = ROLES): string {
    return roles.map(r => (isAr
        ? `• **${r.ar}** — ${r.noteAr}`
        : `• **${r.en}** — ${r.noteEn}`)).join('\n');
}

/**
 * The role a NEW account gets when nobody says which — the safe one. A typo in
 * a role name must never quietly hand somebody the keys.
 */
export const DEFAULT_NEW_ROLE: RoleKey = 'staff';

/** Is this a role this system knows? Used to refuse invented ones at the door. */
export function isRole(key: string): key is RoleKey {
    return (ROLE_KEYS as string[]).includes(String(key || '').toLowerCase());
}
