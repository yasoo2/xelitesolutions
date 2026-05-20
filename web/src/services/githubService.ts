/**
 * GitHub Service - Frontend API wrapper for GitHub operations
 */
import { api } from './apiClient';

export interface GitHubUser {
    username: string;
    avatarUrl: string;
    name: string;
}

export interface GitHubRepo {
    id: number;
    name: string;
    fullName: string;
    description: string;
    private: boolean;
    url: string;
    cloneUrl: string;
    language: string;
    updatedAt: string;
    defaultBranch: string;
    stars: number;
}

export interface GitHubCommit {
    sha: string;
    message: string;
    author: string;
    date: string;
}

export interface GitHubBranch {
    name: string;
    protected: boolean;
    sha: string;
}

export interface GitHubContent {
    name: string;
    path: string;
    type: 'file' | 'dir';
    size: number;
    sha: string;
    download_url?: string;
}

class GitHubService {
    async connect(token: string): Promise<GitHubUser> {
        return api.post('/github/connect', { token });
    }

    async getStatus(workspaceId?: string): Promise<{ connected: boolean; activeRepo?: string } & Partial<GitHubUser>> {
        const query = workspaceId ? { 'x-workspace-id': workspaceId } : {};
        // apiClient currently doesn't add headers from query but we can use query for now or just pass it as second arg if we had one
        // Actually, let's just use query and update the backend to check query as well
        return api.get('/github/status', workspaceId ? { workspaceId } : undefined);
    }

    async listRepos(): Promise<GitHubRepo[]> {
        const data = await api.get('/github/repos');
        return data.repos || [];
    }

    async createRepo(name: string, description?: string, isPrivate = true): Promise<any> {
        return api.post('/github/repos', { name, description, isPrivate });
    }

    async getContents(owner: string, repo: string, path = '', ref?: string): Promise<GitHubContent[]> {
        const query: Record<string, string> = {};
        if (path) query.path = path;
        if (ref) query.ref = ref;
        const data = await api.get(`/github/repos/${owner}/${repo}/contents`, query);
        return Array.isArray(data.contents) ? data.contents : [data.contents];
    }

    async getCommits(owner: string, repo: string): Promise<GitHubCommit[]> {
        const data = await api.get(`/github/repos/${owner}/${repo}/commits`);
        return data.commits || [];
    }

    async getBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
        const data = await api.get(`/github/repos/${owner}/${repo}/branches`);
        return data.branches || [];
    }

    async setActiveRepo(workspaceId: string, fullName: string): Promise<void> {
        return api.put(`/workspaces/${workspaceId}`, { activeRepo: fullName });
    }
}

export const githubService = new GitHubService();
