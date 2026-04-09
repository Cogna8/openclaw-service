import { neon } from "@neondatabase/serverless";

type NeonSQL = ReturnType<typeof neon>;

let instance: NeonSQL | undefined;

function getOpenClawSql(): NeonSQL {
  if (instance) return instance;

  const url = process.env.CG8_OPENCLAW_DATABASE_URL;
  if (!url) {
    throw new Error("CG8_OPENCLAW_DATABASE_URL is required");
  }

  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete("channel_binding");
  instance = neon(cleanUrl.toString());
  return instance;
}

export async function createOpenClawAccount(
  publicId: string,
): Promise<{ id: string; publicId: string }> {
  const sql = getOpenClawSql();
  const rows = await sql`
    INSERT INTO accounts (
      public_id, plan, status, evaluations_limit_monthly,
      max_agents, max_rules_per_agent, post_cap_new_rules_limit,
      api_version, capability_flags, created_at, updated_at
    )
    VALUES (
      ${publicId}, 'free', 'active', 10000, 3, 25, 3, 'v1', '{}', NOW(), NOW()
    )
    RETURNING id, public_id
  `;
  const result = rows as Record<string, unknown>[];
  const row = result[0];
  return { id: row.id as string, publicId: row.public_id as string };
}
