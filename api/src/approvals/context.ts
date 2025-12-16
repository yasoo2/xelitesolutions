type PlanCtx = { runId: string; name: string; input: any };
const map = new Map<string, PlanCtx>();

export const planContext = {
  set(approvalId: string, ctx: PlanCtx) { map.set(approvalId, ctx); },
  get(approvalId: string) { return map.get(approvalId); },
  delete(approvalId: string) { map.delete(approvalId); }
};
