/** mcp:config: the snippet that connects an MCP client to the Mentio MCP
 *  server, with the key filled in from the CLI's own settings. */
export const DEFAULT_MCP_URL = 'https://mcp.mentio.dev/mcp';

export type McpClientKind = 'claude' | 'cursor' | 'vscode' | 'generic';

export function mcpConfig(kind: McpClientKind, url: string, apiKey: string): string {
  const auth = `Bearer ${apiKey}`;
  switch (kind) {
    case 'claude':
      return `claude mcp add --transport http mentio ${url} --header "Authorization: ${auth}"`;
    case 'vscode':
      return JSON.stringify({ servers: { mentio: { type: 'http', url, headers: { Authorization: auth } } } }, null, 2);
    case 'cursor':
      return JSON.stringify({ mcpServers: { mentio: { url, headers: { Authorization: auth } } } }, null, 2);
    case 'generic':
      return JSON.stringify({ mcpServers: { mentio: { type: 'http', url, headers: { Authorization: auth } } } }, null, 2);
  }
}
