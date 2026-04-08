import {
  trimWhitespace,
  lowercaseEnumValues,
  lowercaseEmail,
  normalizePath,
} from "../lib/rule-normalization.js";

export function normalizeEvaluateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...body };

  if (typeof result.agent_id === "string") {
    result.agent_id = trimWhitespace(result.agent_id);
  }

  // session
  if (result.session && typeof result.session === "object") {
    const session = { ...(result.session as Record<string, unknown>) };
    if (typeof session.id === "string") session.id = trimWhitespace(session.id);
    if (typeof session.key === "string") session.key = trimWhitespace(session.key);
    result.session = session;
  }

  // channel
  if (result.channel && typeof result.channel === "object") {
    const channel = { ...(result.channel as Record<string, unknown>) };
    if (typeof channel.provider === "string") {
      channel.provider = trimWhitespace(channel.provider);
    }
    if (typeof channel.type === "string") {
      channel.type = lowercaseEnumValues(channel.type);
    }
    result.channel = channel;
  }

  // tool_call
  if (result.tool_call && typeof result.tool_call === "object") {
    const toolCall = { ...(result.tool_call as Record<string, unknown>) };
    if (typeof toolCall.tool_name === "string") {
      toolCall.tool_name = trimWhitespace(toolCall.tool_name);
    }
    if (typeof toolCall.action_class === "string") {
      toolCall.action_class = lowercaseEnumValues(toolCall.action_class);
    }
    result.tool_call = toolCall;
  }

  return result;
}

export function normalizeCreateRuleBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...body };

  if (typeof result.agent_id === "string") {
    result.agent_id = trimWhitespace(result.agent_id);
  }
  if (typeof result.type === "string") {
    result.type = lowercaseEnumValues(result.type);
  }

  return result;
}

export function normalizeRegisterAgentBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...body };

  // agent
  if (result.agent && typeof result.agent === "object") {
    const agent = { ...(result.agent as Record<string, unknown>) };
    if (typeof agent.external_id === "string") {
      agent.external_id = trimWhitespace(agent.external_id);
    }
    if (typeof agent.name === "string") {
      agent.name = trimWhitespace(agent.name);
    }
    if (typeof agent.source === "string") {
      agent.source = lowercaseEnumValues(agent.source);
    }
    if (typeof agent.plugin_version === "string") {
      agent.plugin_version = trimWhitespace(agent.plugin_version);
    }
    if (typeof agent.agent_version === "string") {
      agent.agent_version = trimWhitespace(agent.agent_version);
    }
    result.agent = agent;
  }

  // tools
  if (Array.isArray(result.tools)) {
    result.tools = result.tools.map((tool: unknown) => {
      if (typeof tool !== "object" || tool === null) return tool;
      const t = { ...(tool as Record<string, unknown>) };
      if (typeof t.name === "string") t.name = trimWhitespace(t.name);
      if (typeof t.action_class === "string") {
        t.action_class = lowercaseEnumValues(t.action_class);
      }
      return t;
    });
  }

  if (typeof result.catalog_hash === "string") {
    result.catalog_hash = trimWhitespace(result.catalog_hash);
  }

  return result;
}

export function normalizeRulesQuery(query: {
  agent_id: string;
  status: string;
}): { agent_id: string; status: string } {
  return {
    agent_id: trimWhitespace(query.agent_id),
    status: lowercaseEnumValues(query.status),
  };
}

// Re-export Pack 1 helpers for convenience in normalization tests
export { lowercaseEmail, normalizePath };
