import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LongTermMemory } from '../core/memory/long-term-memory';

describe('workspace-scoped long-term memory', () => {
    let directory = '';
    let memory: LongTermMemory;

    beforeEach(() => {
        directory = path.join(os.tmpdir(), `joe-workspace-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        memory = new LongTermMemory(directory);
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    test('never recalls a conversation from another workspace into a fresh project', async () => {
        await memory.remember('local-user', {
            type: 'conversation',
            content: 'Deploy the previous project to GitHub Pages and resolve approval_required.',
            metadata: { workspaceId: '/projects/previous' },
            importance: 1,
        });

        const freshProjectContext = await memory.getContextSummary(
            'local-user',
            'Build NEXUS locally with tests and no external publishing.',
            { workspaceId: '/projects/nexus' },
        );
        const priorProjectContext = await memory.getContextSummary(
            'local-user',
            'Build NEXUS locally with tests and no external publishing.',
            { workspaceId: '/projects/previous' },
        );

        expect(freshProjectContext).not.toMatch(/GitHub Pages|approval_required|Deploy/i);
        expect(priorProjectContext).toMatch(/GitHub Pages|approval_required|Deploy/i);
    });

    test('keeps user preferences global while conversation history stays project-private', async () => {
        await memory.learnFromConversation('local-user', [
            { role: 'user', content: 'My name is Younes and I build React projects.' },
        ], { workspaceId: '/projects/previous' });
        await memory.remember('local-user', {
            type: 'conversation',
            content: 'Publish the previous React project after connecting GitHub Pages.',
            metadata: { workspaceId: '/projects/previous' },
            importance: 1,
        });

        const context = await memory.getContextSummary(
            'local-user',
            'Create a local NEXUS architecture and test it without publishing.',
            { workspaceId: '/projects/nexus' },
        );

        expect(context).toContain('User name: Younes');
        expect(context).toContain('Prefers: react');
        expect(context).not.toMatch(/GitHub Pages|Publish the previous/i);
    });

    test('reports project provenance separately from global profile context', async () => {
        await memory.learnFromConversation('local-user', [
            { role: 'user', content: 'I build React projects.' },
        ], { workspaceId: '/projects/previous' });

        const freshDetails = await memory.getContextDetails(
            'local-user',
            'Build a local NEXUS project.',
            { workspaceId: '/projects/nexus' },
        );
        expect(freshDetails.text).toContain('Prefers: react');
        expect(freshDetails.hasWorkspaceContext).toBe(false);

        await memory.remember('local-user', {
            type: 'conversation',
            content: 'Investigate the current NEXUS implementation.',
            metadata: { workspaceId: '/projects/nexus' },
            importance: 1,
        });
        const projectDetails = await memory.getContextDetails(
            'local-user',
            'Investigate the current NEXUS implementation.',
            { workspaceId: '/projects/nexus' },
        );
        expect(projectDetails.hasWorkspaceContext).toBe(true);
    });
});
