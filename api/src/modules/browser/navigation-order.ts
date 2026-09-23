const current = new WeakMap<object, symbol>();

/** Supersession is scoped to the actual page, never shared across users/pages. */
export function claimNavigation(page: object) {
    const token = Symbol('navigation');
    current.set(page, token);
    return {
        isCurrent: () => current.get(page) === token,
        release: () => { if (current.get(page) === token) current.delete(page); },
    };
}
