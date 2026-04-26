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
  variantsDetailed: { pattern: string; description: string }[];
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
    variantsDetailed: [
      { pattern: "shell", description: "Runs system commands on the host machine" },
      { pattern: "bash", description: "Runs Bash commands (Linux/macOS terminal)" },
      { pattern: "zsh", description: "Runs Zsh commands (macOS terminal)" },
      { pattern: "sh", description: "Runs POSIX shell commands" },
      { pattern: "cmd", description: "Runs commands in Windows Command Prompt" },
      { pattern: "powershell", description: "Runs commands in Windows PowerShell" },
      { pattern: "pwsh", description: "Runs commands in PowerShell Core" },
      { pattern: "run_shell_command", description: "Runs a system command via shell" },
      { pattern: "execute_shell", description: "Runs a system command via shell" },
      { pattern: "shell_exec", description: "Runs a system command via shell" },
      { pattern: "exec_command", description: "Runs a system command directly" },
      { pattern: "execute_command", description: "Runs a system command directly" },
      { pattern: "subprocess", description: "Launches a separate program or process" },
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
    variantsDetailed: [
      { pattern: "file_delete", description: "Permanently deletes a file" },
      { pattern: "delete_file", description: "Permanently deletes a file" },
      { pattern: "rm", description: "Deletes files or folders (Unix)" },
      { pattern: "rmdir", description: "Deletes an entire directory" },
      { pattern: "unlink", description: "Removes a file from the filesystem" },
      { pattern: "remove_file", description: "Permanently deletes a file" },
      { pattern: "del", description: "Deletes files (Windows)" },
      { pattern: "trash", description: "Moves a file to the trash" },
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
    variantsDetailed: [
      { pattern: "file_write", description: "Writes content to a file on disk" },
      { pattern: "write_file", description: "Writes content to a file on disk" },
      { pattern: "create_file", description: "Creates a new file on disk" },
      { pattern: "edit_file", description: "Modifies an existing file" },
      { pattern: "str_replace", description: "Finds and replaces text inside a file" },
      { pattern: "save_file", description: "Saves content to a file on disk" },
      { pattern: "update_file", description: "Modifies an existing file" },
      { pattern: "patch_file", description: "Applies a diff or patch to a file" },
      { pattern: "append_file", description: "Adds content to the end of a file" },
      { pattern: "modify_file", description: "Modifies an existing file" },
      { pattern: "overwrite_file", description: "Replaces all content in a file" },
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
    variantsDetailed: [
      { pattern: "http_request", description: "Sends a request to an external server" },
      { pattern: "http_get", description: "Fetches data from an external server" },
      { pattern: "http_post", description: "Sends data to an external server" },
      { pattern: "http_put", description: "Sends an update to an external server" },
      { pattern: "http_delete", description: "Sends a delete request to an external server" },
      { pattern: "curl", description: "Fetches or sends data to a URL" },
      { pattern: "wget", description: "Downloads a file from a URL" },
      { pattern: "web_fetch", description: "Fetches content from a URL" },
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
    variantsDetailed: [
      { pattern: "python", description: "Runs Python code on the host machine" },
      { pattern: "run_python", description: "Runs a Python script on the host machine" },
      { pattern: "node", description: "Runs JavaScript code via Node.js" },
      { pattern: "run_node", description: "Runs a Node.js script" },
      { pattern: "run_code", description: "Runs arbitrary code on the host machine" },
      { pattern: "run_script", description: "Runs a script file on the host machine" },
      { pattern: "code_exec", description: "Runs arbitrary code on the host machine" },
      { pattern: "execute_code", description: "Runs arbitrary code on the host machine" },
      { pattern: "exec", description: "Runs a command or code directly" },
      { pattern: "eval", description: "Evaluates and runs code at runtime" },
      { pattern: "run_javascript", description: "Runs JavaScript code on the host machine" },
      { pattern: "execute_python", description: "Runs Python code on the host machine" },
    ],
  },
];

export function getTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}

export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_IDS.includes(id as TemplateId);
}
