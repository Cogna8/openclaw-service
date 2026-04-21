/**
 * Policy template definitions. The service is the source of truth for:
 *   - template id
 *   - tool-name variants
 *   - default enablement
 *
 * Portal consumes this via GET /api/v1/portal/policies.
 *
 * Adding/removing templates requires:
 *   1. update TEMPLATE_IDS
 *   2. update POLICY_TEMPLATES
 *   3. update the CHECK constraint in the migration (new migration if deployed)
 */

export const TEMPLATE_IDS = [
  "block_shell_execution",
  "block_file_deletion",
  "block_file_writes",
  "block_outbound_http",
  "block_code_execution",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type PolicyTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  variants: string[]; // tool-name matches, lowercase, unique
};

export const POLICY_TEMPLATES: readonly PolicyTemplate[] = [
  {
    id: "block_shell_execution",
    name: "Block shell command execution",
    description:
      "Prevent agents from executing shell commands. Covers common shell invocations across Unix, Windows, and containerized environments.",
    defaultEnabled: true,
    variants: [
      "shell",
      "bash",
      "zsh",
      "sh",
      "cmd",
      "powershell",
      "pwsh",
      "run_shell_command",
      "execute_shell",
      "shell_exec",
      "exec_command",
      "execute_command",
      "subprocess",
    ],
  },
  {
    id: "block_file_deletion",
    name: "Block file deletions",
    description:
      "Prevent agents from deleting files or directories. Covers rm, unlink, trash, and compound variants.",
    defaultEnabled: true,
    variants: [
      "file_delete",
      "delete_file",
      "rm",
      "rmdir",
      "unlink",
      "remove_file",
      "del",
      "trash",
    ],
  },
  {
    id: "block_file_writes",
    name: "Block file writes",
    description:
      "Prevent agents from creating, editing, or overwriting files. Covers write, edit, patch, append, and str_replace patterns.",
    defaultEnabled: true,
    variants: [
      "file_write",
      "write_file",
      "create_file",
      "edit_file",
      "str_replace",
      "save_file",
      "update_file",
      "patch_file",
      "append_file",
      "modify_file",
      "overwrite_file",
    ],
  },
  {
    id: "block_outbound_http",
    name: "Block outbound HTTP",
    description:
      "Prevent agents from making outbound HTTP requests. Restrictive — most agents need network access. Off by default.",
    defaultEnabled: false,
    variants: [
      "http_request",
      "http_get",
      "http_post",
      "http_put",
      "http_delete",
      "curl",
      "wget",
      "web_fetch",
    ],
  },
  {
    id: "block_code_execution",
    name: "Block code execution",
    description:
      "Prevent agents from executing code interpreters. Covers Python, Node, and generic code-exec tool names.",
    defaultEnabled: true,
    variants: [
      "python",
      "run_python",
      "node",
      "run_node",
      "run_code",
      "run_script",
      "code_exec",
      "execute_code",
      "exec",
      "eval",
      "run_javascript",
      "execute_python",
    ],
  },
];

export function getTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}

export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_IDS.includes(id as TemplateId);
}
