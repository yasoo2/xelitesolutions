/** Server opt-in; each admitted capability retains its own execution boundary. */
export function autonomousDevelopmentEnabled(value: unknown): boolean {
    return value === '1';
}

export function autonomousIdentity(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    return id && id.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(id) ? id : null;
}

/** Unknown tools and aliases cannot borrow the admission of a known tool. */
export function autonomousToolAdmitted(name: unknown): boolean {
    return name === 'central_answer' || name === 'echo' || name === 'read_file' || name === 'write_file' || name === 'file_edit'
        || name === 'inspect_directory' || name === 'project_pipeline' || name === 'runtime_diagnostics' || name === 'screenshot' || name === 'screenshot_result';
}

export function autonomousContextMatches(
    context: { userId?: unknown; sessionId?: unknown; workspaceId?: unknown } | undefined,
    ambient: { userId?: unknown; sessionId?: unknown },
    owner: { userId?: unknown; workspaceId?: unknown },
): boolean {
    const uid = autonomousIdentity(context?.userId);
    const sid = autonomousIdentity(context?.sessionId);
    const ws = autonomousIdentity(context?.workspaceId);
    return !!uid && !!sid && !!ws
        && uid === autonomousIdentity(ambient.userId)
        && sid === autonomousIdentity(ambient.sessionId)
        && uid === autonomousIdentity(owner.userId)
        && ws === autonomousIdentity(owner.workspaceId);
}
