import type { EngineeringTaskType, PromptAnalysis, ProjectContext } from './types';

export interface ToolRoute {
  taskType: EngineeringTaskType;
  tools: string[];
  reason: string;
}

const COMMON_READ_TOOLS = ['inspect_directory', 'read_file', 'grep_search', 'project_detect'];

export class ToolRouter {
  selectTools(analysis: PromptAnalysis, _project: ProjectContext): ToolRoute {
    const taskType = analysis.taskType;

    if (taskType === 'ui') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'file_edit', 'write_file', 'npm_manager', 'visual_qa'],
        reason: 'UI work needs focused file inspection, safe edits, build validation, and optional visual checks.',
      };
    }

    if (taskType === 'backend') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'file_edit', 'write_file', 'api_tester', 'npm_manager'],
        reason: 'Backend work needs route/service inspection, safe edits, API testing, and build/test validation.',
      };
    }

    if (taskType === 'security') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'file_edit', 'secrets_scan_repo', 'dependency_audit', 'quality_run'],
        reason: 'Security work must inspect sensitive code, scan for secrets/dependency issues, and avoid broad tool exposure.',
      };
    }

    if (taskType === 'deploy') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'docker_manager', 'deploy_project', 'monitoring', 'quality_run'],
        reason: 'Deployment work needs config inspection, controlled deploy tooling, and health verification.',
      };
    }

    if (taskType === 'browser') {
      return {
        taskType,
        tools: ['browser_run', 'browser_snapshot', 'visual_qa', 'screenshot', 'read_file'],
        reason: 'Browser work should use browser-specific tools and avoid unrelated code generation tools.',
      };
    }

    if (taskType === 'bugfix') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'file_edit', 'npm_manager', 'api_tester', 'quality_run'],
        reason: 'Bug fixing requires diagnosis first, then minimal patching and validation.',
      };
    }

    if (taskType === 'feature') {
      return {
        taskType,
        tools: [...COMMON_READ_TOOLS, 'architect', 'file_edit', 'write_file', 'npm_manager', 'quality_run'],
        reason: 'Feature work needs architecture, scoped edits/creates, and validation.',
      };
    }

    return {
      taskType,
      tools: [...COMMON_READ_TOOLS, 'central_answer'],
      reason: 'Unknown or explanation tasks should start with inspection and answer generation, not broad execution.',
    };
  }
}

export const toolRouter = new ToolRouter();
