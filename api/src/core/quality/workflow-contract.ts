export interface WorkflowSemanticDefect {
    id: string;
    message: string;
    repairInstruction: string;
}

export interface WorkflowApiContract {
    resource: string;
    columns: string[];
    supportingSource?: string;
}

const asks = (request: string, pattern: RegExp): boolean => pattern.test(String(request || ''));
const has = (source: string, ...patterns: RegExp[]): boolean => patterns.every(pattern => pattern.test(source));

function requestedRoleNames(request: string): string[] {
    const names = new Set<string>();
    for (const match of request.matchAll(/\b(member|manager|admin|administrator|owner|editor|viewer|reviewer|agent|staff|user)s?\b/giu)) {
        names.add(match[1].toLowerCase());
    }
    return [...names];
}

/** Verify coordinated workflow behaviour instead of accepting matching labels. */
export function inspectWorkflowEngineSource(requestRaw: string, sourceRaw: string, contract?: WorkflowApiContract): WorkflowSemanticDefect[] {
    const request = String(requestRaw || '');
    const source = String(sourceRaw || '');
    const support = String(contract?.supportingSource || '');
    const defects: WorkflowSemanticDefect[] = [];
    const add = (id: string, message: string, repairInstruction: string) => defects.push({ id, message, repairInstruction });

    if (asks(request, /\bsign[- ]?in\b|\blogin\b|\bauth(?:entication)?\b|تسجيل\s*الدخول/iu)
        && !has(`${source}\n${support}`, /apiLogin|login|signIn|signedIn|currentUser/i, /password|credential|token|session/i, /<form\b|onSubmit\s*=/i)) {
        add('workflow_sign_in_missing', 'Sign-in is named but no credential form and authenticated session flow are implemented.',
            'Implement a real sign-in form connected to the project authentication API, persist only the issued token/session, expose the signed-in identity, and provide sign-out plus invalid-credential feedback.');
    }
    if (asks(request, /\b(?:member|manager|admin|administrator|owner|editor|viewer|reviewer|agent|staff|user)s?(?:\s+and\s+\w+)?\s+roles?\b|\bpermissions?\b|\brbac\b|صلاحيات|أدوار/iu)) {
        const requestedRoles = requestedRoleNames(request);
        const namesRepresented = requestedRoles.length >= 2
            ? requestedRoles.every(role => new RegExp(`\\b${role}\\b`, 'i').test(source))
            : /role\s*[:=][\s\S]{0,160}(?:'[^']+'|"[^"]+")[\s\S]{0,160}(?:'[^']+'|"[^"]+")/i.test(source);
        const permissionsEnforced = has(source, /role|permission|can[A-Z]|allowedRoles/i, /disabled|hidden|filter|if\s*\(|includes\s*\(/i);
        if (!namesRepresented || !permissionsEnforced) {
            add('workflow_roles_not_enforced', 'Requested roles are not all represented and used to permit or deny an action.',
                `Represent every requested role explicitly${requestedRoles.length ? ` (${requestedRoles.join(', ')})` : ''}. Derive permissions from the authenticated role and use them to gate privileged and ordinary paths; do not merely print role names.`);
        }
    }
    if (asks(request, /\bprivate\b|\bvisibility\b|\baccess\s+control\b|خاص(?:ة|ه)?|خصوصي/iu)
        && !has(source, /private|visibility|ownerId|owner_id|createdBy|reporter/i, /currentUser|user\??\.id|ownerId|owner_id|createdBy|reporter/i, /filter\s*\(|canView|visibleIssues/i)) {
        add('workflow_privacy_not_enforced', 'Private records are named but the visible collection is not scoped to the authenticated person.',
            'Store an owner/reporter identity on each private record and derive the visible list from the signed-in user. A manager may see all records; a member may see only records allowed by the request. Include a visible private/public indicator.');
    }
    if (asks(request, /\bassign(?:ment|ed|ee)?\b|إسناد|تعيين/iu)
        && !has(source, /assignee|assignedTo|assignment/i, /select|combobox|option/i, /setIssues|updateIssue|patch/i)) {
        add('workflow_assignment_missing', 'Assignment is named but no assignee control updates issue state.',
            'Add an assignee field and a manager-authorized assignment control that updates the selected issue and records the actor and timestamp.');
    }

    if (contract) {
        const columns = new Set((contract.columns || []).map(column => String(column).toLowerCase()));
        if (asks(request, /\bassign(?:ment|ed|ee)?\b|إسناد|تعيين/iu)
            && columns.has('assignee') && /\bassignedTo\b/.test(source) && !/\bassignee\b/.test(source)) {
            add('workflow_api_field_mismatch', 'The interface writes assignedTo but the generated API stores assignee.',
                'Use the exact backend field name `assignee` for reads, controls, and writes. Do not invent aliases unless the store explicitly maps them.');
        }
        const phantomCollection = source.match(/api(?:List|Create|Update|Delete)On\s*\([^,]+,\s*['"](comments?|audit(?:_history)?)['"]/i);
        if (phantomCollection) {
            add('workflow_phantom_api_resource', `The interface calls a ${phantomCollection[1]} collection that the backend does not expose.`,
                `Keep ${contract.resource} as the primary collection. Use apiPost(content.api, '/' + issue.id + '/comments', { text }), '/transition', and '/assign' for workflow actions.`);
        }
        if (/getRole\s*\(\s*\)\s*===?\s*['"](?:manager|member)['"]/i.test(source)
            && !/(?:owner[^\n]{0,100}manager|staff[^\n]{0,100}member|manager[^\n]{0,100}owner|member[^\n]{0,100}staff)/i.test(source)) {
            add('workflow_role_mapping_missing', 'The interface compares requested role labels directly with backend role keys.',
                'Map backend `owner` to the requested manager role and backend `staff` to the requested member role. Authorize with owner/staff; display manager/member to the user.');
        }
        if (asks(request, /\bstatus\s+transitions?\b|انتقالات?\s*الحالة/iu)
            && !/(?:apiPost\s*\([^)]*\/transition|act\s*\(\s*['"]\/transition)/i.test(source)) {
            add('workflow_transition_not_persisted', 'Status changes do not use the server transition endpoint.',
                `Persist transitions with apiPost(content.api, '/' + issue.id + '/transition', { status: next }); then replace the local row with response.item.`);
        }
        if (asks(request, /\bassign(?:ment|ed|ee)?\b|إسناد|تعيين/iu)
            && !/(?:apiPost\s*\([^)]*\/assign|act\s*\(\s*['"]\/assign)/i.test(source)) {
            add('workflow_assignment_not_persisted', 'Assignment does not use the manager-only server endpoint.',
                `Persist assignment with apiPost(content.api, '/' + issue.id + '/assign', { assignee }); only expose it when getRole() is owner.`);
        }
        if (asks(request, /\bcomments?\b|تعليقات/iu)
            && !/(?:apiPost\s*\([^)]*\/comments|act\s*\(\s*['"]\/comments)/i.test(source)) {
            add('workflow_comment_not_persisted', 'Comments are not appended through the server activity endpoint.',
                `Append comments with apiPost(content.api, '/' + issue.id + '/comments', { text }); do not overwrite the comments field directly.`);
        }
    }
    if (asks(request, /\bstatus\s+transitions?\b|\bworkflow\b|انتقالات?\s*الحالة|سير\s*العمل/iu)
        && !has(source, /transition|allowedNext|statusFlow|STATUS/i, /setIssues|updateIssue|patch/i, /invalid|includes\s*\(|canTransition|disabled/i)) {
        add('workflow_transitions_uncontrolled', 'A status selector exists without evidence that invalid transitions are prevented.',
            'Define an allowed-transition map or predicate, offer only valid next states, reject invalid transitions, and append the successful transition to the audit history.');
    }
    if (asks(request, /\bcomments?\b|تعليقات/iu)
        && !has(source, /comments?/i, /addComment|submitComment|setIssues|setComments/i, /textarea|<input\b/i)) {
        add('workflow_comments_missing', 'Comments are named but no composer appends a visible comment to an issue.',
            'Add a per-issue comment composer with non-empty validation, author and timestamp, persist the comment, and render it in the selected issue activity.');
    }
    if (asks(request, /\baudit(?:\s+(?:log|trail|history))?\b|سجل\s*التدقيق|تاريخ\s*التغييرات/iu)
        && !has(source, /audit|history|activity/i, /actor|user|author/i, /timestamp|createdAt|Date\s*\(/i, /push|concat|\.\.\.|append/i)) {
        add('workflow_audit_missing', 'Audit history is named but mutations do not append actor-and-time events.',
            'Create an append-only activity entry for creation, assignment, status changes, and comments. Render actor, action, and timestamp in the issue details and never derive the history from the current state alone.');
    }
    return defects;
}

export function formatWorkflowSemanticRepair(defects: WorkflowSemanticDefect[]): string {
    return defects.map((defect, index) => `${index + 1}. [${defect.id}] ${defect.message}\nRepair: ${defect.repairInstruction}`).join('\n');
}
