import { tools } from "../../modules/tools/registry";

export const MAX_PROVIDER_TOOLS = Number(process.env.MAX_PROVIDER_TOOLS) || 256;

export const PRIORITY_TOOL_NAMES: string[] = [
  "echo", "notify_user", "execute_python", "query_datasource", "archive_files",
  "deploy_project", "todo_write", "ask_user", "project_detect", "analyze_codebase",
  "website_full_pipeline", "read_file", "write_file", "file_edit", "scaffold_project",
  "scaffold_full_stack", "read_file_tree", "ls", "grep_search", "fs_glob",
  "check_syntax", "generate_tests", "generate_docs", "db_inspect", "quality_run",
  "git_ops", "command_policy_check", "tool_create_shell", "shell_execute", "shell_status",
  "product_search", "web_search", "http_fetch", "central_answer", "knowledge_search",
  "html_extract", "github_create_repo", "image_generate", "deep_research", "browser_run",
  "browser_action", "browser_vision", "codebase_outline", "search_api", "dependency_graph",
  "business_logic", "chaos_testing", "compliance_validator", "cost_estimator", "ambiguity_resolver",
  "multi_agent_debate", "self_confidence", "terraform_ops", "kubernetes_ops", "db_schema_migrator",
  "sonar_analysis", "security_scan_repo",
];

export function selectToolDefsForProvider(
  all: typeof tools,
  limit: number,
  messages: any[],
) {
  const byName = new Map(all.map((t) => [t.name, t] as const));
  const selected: typeof tools = [];
  const seen = new Set<string>();

  const routingTextRaw = messages
    .slice(-10)
    .map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content || ""))
    .join("\n");

  const routingNorm = routingTextRaw.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();

  // Pattern Flags
  const wantsBrowser = /browser|browse|web|website|open|visit|goto|nav|navigate/i.test(routingTextRaw);
  const wantsSearch = /search|research|find|lookup|web_search|deep_research|knowledge/i.test(routingTextRaw);
  const wantsFs = /file|folder|directory|path|read|write|edit|tree|glob|grep/i.test(routingTextRaw);
  const wantsShell = /terminal|command|shell|npm|pnpm|yarn|pip|python|node|run/i.test(routingTextRaw);

  const effectiveLimit = Math.max(PRIORITY_TOOL_NAMES.length, Math.min(limit, 72));

  for (const name of PRIORITY_TOOL_NAMES) {
    const t = byName.get(name);
    if (t) {
      selected.push(t);
      seen.add(t.name);
      if (selected.length >= effectiveLimit) break;
    }
  }

  const scoreTool = (t: any) => {
    const tags: string[] = Array.isArray(t?.tags) ? t.tags : [];
    const name = String(t?.name || "").toLowerCase();
    let score = 0;

    if (tags.includes("agent")) score += 50;
    if (wantsBrowser && (tags.includes("browser") || name.startsWith("browser_"))) score += 120;
    if (wantsSearch && (tags.includes("search") || tags.includes("knowledge"))) score += 85;
    if (wantsFs && (tags.includes("fs") || name.includes("file_"))) score += 80;
    if (wantsShell && (tags.includes("shell") || name.includes("shell"))) score += 70;
    
    return score;
  };

  const preferred = all
    .filter((t) => !seen.has(t.name))
    .sort((a, b) => scoreTool(b) - scoreTool(a));

  for (const t of preferred) {
    if (selected.length >= effectiveLimit) break;
    selected.push(t);
    seen.add(t.name);
  }

  return selected.slice(0, effectiveLimit);
}
