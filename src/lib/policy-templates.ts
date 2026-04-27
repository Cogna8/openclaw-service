/**
 * Policy template definitions. The service is the source of truth for:
 *   - template id
 *   - tool-name variants
 *   - default enablement
 *   - risk class (controls "critical secure defaults")
 *   - category (controls portal grouping)
 *
 * Portal consumes this via GET /api/v1/portal/policies and must not duplicate
 * template data as a hardcoded source of truth.
 *
 * Adding/removing templates requires:
 *   1. update TEMPLATE_IDS
 *   2. update POLICY_TEMPLATES
 *   3. update the CHECK constraint in the migration (new migration if deployed)
 *
 * Variant rules (enforced by tests):
 *   - Variants must be lowercase, unique, and match /^[a-z0-9_-]+$/.
 *   - The request validator enforces /^[a-zA-Z0-9_-]+$/ on tool_call.tool_name.
 *     Any variant containing a character outside that set (e.g. a dot) can never
 *     match a real request because the request is rejected at validation
 *     before the matcher runs. The lowercase subset here keeps that invariant.
 *   - Each variant must have exactly one variantsDetailed entry, and every
 *     variantsDetailed.pattern must correspond exactly to a value in variants.
 */

export const TEMPLATE_IDS = [
  "block_shell_execution",
  "block_file_deletion",
  "block_file_writes",
  "block_outbound_http",
  "block_code_execution",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATE_RISK_CLASSES = [
  "critical",
  "high",
  "medium",
] as const;

export type TemplateRiskClass = (typeof TEMPLATE_RISK_CLASSES)[number];

export const TEMPLATE_CATEGORIES = [
  "filesystem",
  "network",
  "code_execution",
  "destructive_ops",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type PolicyTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  riskClass: TemplateRiskClass;
  category: TemplateCategory;
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
    riskClass: "critical",
    category: "code_execution",
    variants: [
      "shell",
      "bash",
      "zsh",
      "sh",
      "fish",
      "cmd",
      "command_prompt",
      "powershell",
      "pwsh",
      "terminal",
      "run_terminal",
      "run_shell",
      "run_shell_command",
      "execute_shell",
      "shell_exec",
      "exec_shell",
      "exec_command",
      "execute_command",
      "run_command",
      "command",
      "subprocess",
      "process_exec",
      "spawn_process",
      "system",
      "os_system",
    ],
    variantsDetailed: [
      { pattern: "shell", description: "Runs system commands on the host machine" },
      { pattern: "bash", description: "Runs Bash commands (Linux/macOS terminal)" },
      { pattern: "zsh", description: "Runs Zsh commands (default macOS terminal)" },
      { pattern: "sh", description: "Runs POSIX shell commands" },
      { pattern: "fish", description: "Runs commands in the Fish shell" },
      { pattern: "cmd", description: "Runs commands in Windows Command Prompt" },
      { pattern: "command_prompt", description: "Runs commands in Windows Command Prompt" },
      { pattern: "powershell", description: "Runs commands in Windows PowerShell" },
      { pattern: "pwsh", description: "Runs commands in cross-platform PowerShell Core" },
      { pattern: "terminal", description: "Opens a terminal session and runs commands" },
      { pattern: "run_terminal", description: "Opens a terminal session and runs commands" },
      { pattern: "run_shell", description: "Runs commands through a system shell" },
      { pattern: "run_shell_command", description: "Runs a single shell command on the host" },
      { pattern: "execute_shell", description: "Runs a single shell command on the host" },
      { pattern: "shell_exec", description: "Runs a single shell command on the host" },
      { pattern: "exec_shell", description: "Runs a single shell command on the host" },
      { pattern: "exec_command", description: "Runs a system command directly, without a shell" },
      { pattern: "execute_command", description: "Runs a system command directly, without a shell" },
      { pattern: "run_command", description: "Runs a system command on the host" },
      { pattern: "command", description: "Runs an arbitrary system command on the host" },
      { pattern: "subprocess", description: "Launches a separate operating system process" },
      { pattern: "process_exec", description: "Launches a new system process and runs it" },
      { pattern: "spawn_process", description: "Spawns a new system process and runs it" },
      { pattern: "system", description: "Calls the OS system() function to run a command" },
      { pattern: "os_system", description: "Calls the OS system() function to run a command" },
    ],
  },
  {
    id: "block_file_deletion",
    name: "Block file deletions",
    description:
      "Prevent agents from deleting files or directories. Covers rm, unlink, trash, and compound variants.",
    defaultEnabled: true,
    riskClass: "critical",
    category: "destructive_ops",
    variants: [
      "file_delete",
      "delete_file",
      "delete_files",
      "remove_file",
      "remove_files",
      "rm",
      "rmdir",
      "unlink",
      "del",
      "erase",
      "trash",
      "move_to_trash",
      "delete_directory",
      "remove_directory",
      "recursive_delete",
      "cleanup_files",
    ],
    variantsDetailed: [
      { pattern: "file_delete", description: "Permanently deletes a file from disk" },
      { pattern: "delete_file", description: "Permanently deletes a file from disk" },
      { pattern: "delete_files", description: "Permanently deletes one or more files from disk" },
      { pattern: "remove_file", description: "Permanently deletes a file from disk" },
      { pattern: "remove_files", description: "Permanently deletes one or more files from disk" },
      { pattern: "rm", description: "Deletes files or folders (Unix rm command)" },
      { pattern: "rmdir", description: "Deletes an entire directory (Unix rmdir command)" },
      { pattern: "unlink", description: "Permanently removes a file from the filesystem" },
      { pattern: "del", description: "Deletes files (Windows del command)" },
      { pattern: "erase", description: "Permanently erases a file from disk" },
      { pattern: "trash", description: "Moves a file to the system trash" },
      { pattern: "move_to_trash", description: "Moves a file to the system trash" },
      { pattern: "delete_directory", description: "Deletes an entire directory and everything inside it" },
      { pattern: "remove_directory", description: "Deletes an entire directory and everything inside it" },
      { pattern: "recursive_delete", description: "Recursively deletes a folder and everything inside it" },
      { pattern: "cleanup_files", description: "Bulk-deletes a set of files" },
    ],
  },
  {
    id: "block_file_writes",
    name: "Block file writes",
    description:
      "Prevent agents from creating, editing, or overwriting files. Covers write, edit, patch, append, and str_replace patterns.",
    defaultEnabled: true,
    riskClass: "high",
    category: "filesystem",
    variants: [
      "file_write",
      "write_file",
      "create_file",
      "edit_file",
      "modify_file",
      "update_file",
      "patch_file",
      "append_file",
      "overwrite_file",
      "save_file",
      "replace_file",
      "str_replace",
      "apply_patch",
      "write_text",
      "write_json",
      "write_config",
      "create_directory",
      "mkdir",
      "touch",
    ],
    variantsDetailed: [
      { pattern: "file_write", description: "Writes content to a file on disk" },
      { pattern: "write_file", description: "Writes content to a file on disk" },
      { pattern: "create_file", description: "Creates a brand-new file on disk" },
      { pattern: "edit_file", description: "Modifies the contents of an existing file" },
      { pattern: "modify_file", description: "Modifies the contents of an existing file" },
      { pattern: "update_file", description: "Modifies the contents of an existing file" },
      { pattern: "patch_file", description: "Applies a diff or patch to an existing file" },
      { pattern: "append_file", description: "Adds content to the end of an existing file" },
      { pattern: "overwrite_file", description: "Replaces all of the content in a file" },
      { pattern: "save_file", description: "Saves content to a file on disk" },
      { pattern: "replace_file", description: "Replaces a file's contents wholesale" },
      { pattern: "str_replace", description: "Finds and replaces text inside a file" },
      { pattern: "apply_patch", description: "Applies a unified diff to one or more files" },
      { pattern: "write_text", description: "Writes plain text to a file on disk" },
      { pattern: "write_json", description: "Writes JSON content to a file on disk" },
      { pattern: "write_config", description: "Writes a configuration file to disk" },
      { pattern: "create_directory", description: "Creates a new folder on disk" },
      { pattern: "mkdir", description: "Creates a new folder on disk (Unix mkdir command)" },
      { pattern: "touch", description: "Creates an empty file or updates a file's timestamp" },
    ],
  },
  {
    id: "block_outbound_http",
    name: "Block outbound HTTP",
    description:
      "Prevent agents from making outbound HTTP requests. Restrictive — most agents need network access. Off by default.",
    defaultEnabled: false,
    riskClass: "high",
    category: "network",
    variants: [
      "http_request",
      "http_get",
      "http_post",
      "http_put",
      "http_patch",
      "http_delete",
      "fetch",
      "web_fetch",
      "web_request",
      "url_fetch",
      "download_url",
      "open_url",
      "curl",
      "wget",
      "axios",
      "node_fetch",
      "node-fetch",
      "got",
      "request",
      "superagent",
      "ky",
      "undici",
      "python_requests",
      "requests",
      "urllib",
      "urllib3",
      "http_client",
      "aiohttp",
      "fetch_url",
      "post_url",
    ],
    variantsDetailed: [
      { pattern: "http_request", description: "Sends an HTTP request to an external server" },
      { pattern: "http_get", description: "Fetches data from an external server over HTTP" },
      { pattern: "http_post", description: "Sends data to an external server over HTTP" },
      { pattern: "http_put", description: "Replaces a resource on an external server over HTTP" },
      { pattern: "http_patch", description: "Updates part of a resource on an external server over HTTP" },
      { pattern: "http_delete", description: "Asks an external server to delete a resource" },
      { pattern: "fetch", description: "Sends an HTTP request from a JavaScript application" },
      { pattern: "web_fetch", description: "Fetches the contents of a web URL" },
      { pattern: "web_request", description: "Sends a request to a web URL" },
      { pattern: "url_fetch", description: "Fetches the contents of a URL" },
      { pattern: "download_url", description: "Downloads a file from a URL" },
      { pattern: "open_url", description: "Opens or fetches a URL over the network" },
      { pattern: "curl", description: "Fetches or sends data to a URL (curl command)" },
      { pattern: "wget", description: "Downloads a file from a URL (wget command)" },
      { pattern: "axios", description: "Sends HTTP requests from a JavaScript application (axios library)" },
      { pattern: "node_fetch", description: "Sends HTTP requests from Node.js (node-fetch library)" },
      { pattern: "node-fetch", description: "Sends HTTP requests from Node.js (node-fetch library)" },
      { pattern: "got", description: "Sends HTTP requests from Node.js (got library)" },
      { pattern: "request", description: "Sends HTTP requests from Node.js (request library)" },
      { pattern: "superagent", description: "Sends HTTP requests from JavaScript (superagent library)" },
      { pattern: "ky", description: "Sends HTTP requests from JavaScript (ky library)" },
      { pattern: "undici", description: "Sends HTTP requests from Node.js (undici library)" },
      { pattern: "python_requests", description: "Sends HTTP requests from Python (requests library)" },
      { pattern: "requests", description: "Sends HTTP requests from Python (requests library)" },
      { pattern: "urllib", description: "Sends HTTP requests from Python (urllib module)" },
      { pattern: "urllib3", description: "Sends HTTP requests from Python (urllib3 library)" },
      { pattern: "http_client", description: "Sends HTTP requests using a built-in HTTP client" },
      { pattern: "aiohttp", description: "Sends asynchronous HTTP requests from Python (aiohttp library)" },
      { pattern: "fetch_url", description: "Fetches the contents of a URL" },
      { pattern: "post_url", description: "Sends data to a URL via HTTP POST" },
    ],
  },
  {
    id: "block_code_execution",
    name: "Block code execution",
    description:
      "Prevent agents from executing code interpreters and compilers. Covers Python, Node, Ruby, and other generic code-exec tool names.",
    defaultEnabled: true,
    riskClass: "critical",
    category: "code_execution",
    variants: [
      "python",
      "python3",
      "run_python",
      "execute_python",
      "python_exec",
      "node",
      "nodejs",
      "run_node",
      "run_javascript",
      "javascript",
      "js_exec",
      "deno",
      "bun",
      "ruby",
      "perl",
      "php",
      "lua",
      "rscript",
      "go_run",
      "cargo_run",
      "java",
      "javac",
      "dotnet",
      "run_code",
      "execute_code",
      "code_exec",
      "eval",
      "exec",
      "run_script",
      "execute_script",
      "script_runner",
    ],
    variantsDetailed: [
      { pattern: "python", description: "Runs Python code on the host machine" },
      { pattern: "python3", description: "Runs Python 3 code on the host machine" },
      { pattern: "run_python", description: "Runs a Python script on the host machine" },
      { pattern: "execute_python", description: "Runs Python code on the host machine" },
      { pattern: "python_exec", description: "Runs Python code on the host machine" },
      { pattern: "node", description: "Runs JavaScript code via Node.js" },
      { pattern: "nodejs", description: "Runs JavaScript code via Node.js" },
      { pattern: "run_node", description: "Runs a Node.js script on the host" },
      { pattern: "run_javascript", description: "Runs JavaScript code on the host" },
      { pattern: "javascript", description: "Runs JavaScript code on the host" },
      { pattern: "js_exec", description: "Runs JavaScript code on the host" },
      { pattern: "deno", description: "Runs JavaScript or TypeScript via the Deno runtime" },
      { pattern: "bun", description: "Runs JavaScript or TypeScript via the Bun runtime" },
      { pattern: "ruby", description: "Runs Ruby code on the host machine" },
      { pattern: "perl", description: "Runs Perl scripts on the host machine" },
      { pattern: "php", description: "Runs PHP code on the host machine" },
      { pattern: "lua", description: "Runs Lua scripts on the host machine" },
      { pattern: "rscript", description: "Runs R scripts on the host machine (Rscript)" },
      { pattern: "go_run", description: "Compiles and runs Go code (go run command)" },
      { pattern: "cargo_run", description: "Compiles and runs Rust code (cargo run command)" },
      { pattern: "java", description: "Runs Java applications on the host machine" },
      { pattern: "javac", description: "Compiles Java source code on the host" },
      { pattern: "dotnet", description: "Runs .NET applications on the host machine" },
      { pattern: "run_code", description: "Runs arbitrary code on the host machine" },
      { pattern: "execute_code", description: "Runs arbitrary code on the host machine" },
      { pattern: "code_exec", description: "Runs arbitrary code on the host machine" },
      { pattern: "eval", description: "Evaluates and runs code at runtime" },
      { pattern: "exec", description: "Runs a command or piece of code directly" },
      { pattern: "run_script", description: "Runs a script file on the host machine" },
      { pattern: "execute_script", description: "Runs a script file on the host machine" },
      { pattern: "script_runner", description: "Runs a script file on the host machine" },
    ],
  },
];

/**
 * Critical defaults: the templates the portal "Apply critical defaults" action
 * enables in one click. Excludes block_outbound_http even though it's high risk
 * — broad network blocking is intentionally opt-in because most agents need
 * network access.
 */
export const CRITICAL_DEFAULT_TEMPLATE_IDS: readonly TemplateId[] =
  POLICY_TEMPLATES.filter((t) => t.riskClass === "critical").map(
    (t) => t.id,
  ) as TemplateId[];

export function getTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}

export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_IDS.includes(id as TemplateId);
}
