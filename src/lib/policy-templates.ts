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
      { pattern: "shell", description: "Generic shell invocation" },
      { pattern: "bash", description: "Bash shell (Linux/macOS)" },
      { pattern: "zsh", description: "Zsh shell (macOS default)" },
      { pattern: "sh", description: "POSIX shell" },
      { pattern: "cmd", description: "Windows Command Prompt" },
      { pattern: "powershell", description: "Windows PowerShell" },
      { pattern: "pwsh", description: "PowerShell Core (cross-platform)" },
      { pattern: "run_shell_command", description: "Run a shell command" },
      { pattern: "execute_shell", description: "Execute via shell" },
      { pattern: "shell_exec", description: "Shell execution call" },
      { pattern: "exec_command", description: "Execute a system command" },
      { pattern: "execute_command", description: "Execute a system command" },
      { pattern: "subprocess", description: "Spawn a child process" },
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
      { pattern: "file_delete", description: "Delete a file" },
      { pattern: "delete_file", description: "Delete a file" },
      { pattern: "rm", description: "Remove files (Unix rm)" },
      { pattern: "rmdir", description: "Remove a directory" },
      { pattern: "unlink", description: "Unlink a file from the filesystem" },
      { pattern: "remove_file", description: "Remove a file" },
      { pattern: "del", description: "Delete files (Windows del)" },
      { pattern: "trash", description: "Move to trash" },
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
      { pattern: "file_write", description: "Write content to a file" },
      { pattern: "write_file", description: "Write content to a file" },
      { pattern: "create_file", description: "Create a new file" },
      { pattern: "edit_file", description: "Edit an existing file" },
      { pattern: "str_replace", description: "Find and replace text in a file" },
      { pattern: "save_file", description: "Save content to a file" },
      { pattern: "update_file", description: "Update file contents" },
      { pattern: "patch_file", description: "Apply a patch to a file" },
      { pattern: "append_file", description: "Append content to a file" },
      { pattern: "modify_file", description: "Modify file contents" },
      { pattern: "overwrite_file", description: "Overwrite a file completely" },
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
      { pattern: "http_request", description: "Make an HTTP request" },
      { pattern: "http_get", description: "HTTP GET request" },
      { pattern: "http_post", description: "HTTP POST request" },
      { pattern: "http_put", description: "HTTP PUT request" },
      { pattern: "http_delete", description: "HTTP DELETE request" },
      { pattern: "curl", description: "Fetch a URL (curl)" },
      { pattern: "wget", description: "Download from a URL (wget)" },
      { pattern: "web_fetch", description: "Fetch web content" },
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
      { pattern: "python", description: "Run Python code" },
      { pattern: "run_python", description: "Run a Python script" },
      { pattern: "node", description: "Run Node.js code" },
      { pattern: "run_node", description: "Run a Node.js script" },
      { pattern: "run_code", description: "Execute arbitrary code" },
      { pattern: "run_script", description: "Run a script file" },
      { pattern: "code_exec", description: "Execute code" },
      { pattern: "execute_code", description: "Execute code" },
      { pattern: "exec", description: "Execute a command or code" },
      { pattern: "eval", description: "Evaluate an expression or code" },
      { pattern: "run_javascript", description: "Run JavaScript code" },
      { pattern: "execute_python", description: "Execute Python code" },
    ],
  },
];

export function getTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}

export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_IDS.includes(id as TemplateId);
}
