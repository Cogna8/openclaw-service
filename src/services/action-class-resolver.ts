import { getDb } from "../lib/db.js";

export async function resolveActionClass(
  agentId: string,
  toolName: string,
  providedActionClass?: string,
): Promise<string | null> {
  if (providedActionClass) return providedActionClass;

  const db = getDb();
  const tool = await db.agentTool.findFirst({
    where: { agentId, toolName, isActive: true },
    select: { actionClass: true },
  });

  return tool?.actionClass ?? null;
}
