/**
 * mentio: the command line for the Mentio API. Every public endpoint is a
 * `noun:verb` command generated from the OpenAPI document at build time
 * (./generated/operations.ts), so the CLI cannot drift from the API. Three
 * commands are hand-written because they are more than one request:
 * auth:*, mentions:watch and mcp:config.
 */
import { Command, Option } from 'commander';
import { writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import pkg from '../package.json' with { type: 'json' };
import { keyPrefix, resolveSettings, writeConfig, type Settings } from './config';
import { buildRequest, coerce, flagHelp, UsageError } from './flags';
import { DEFAULT_APP_URL, LoginError, loginUrl, newState, openBrowser, startCallbackServer } from './login';
import { DEFAULT_MCP_URL, mcpConfig, type McpClientKind } from './mcp';
import { commandName } from './naming';
import { OPERATIONS } from './generated/operations';
import type { CliField, CliOperation } from './operations-types';
import { formatOutput } from './output';
import { BEARER, clientFor, errorEnvelope, runOperation } from './run';
import { watchMentions } from './watch';

const program = new Command();

interface GlobalFlags {
  apiKey?: string;
  apiUrl?: string;
  pretty?: boolean;
  table?: boolean;
}

const stdoutIsTty = (): boolean => Boolean(process.stdout.isTTY);

function print(value: unknown, globals: GlobalFlags): void {
  process.stdout.write(`${formatOutput(value, { pretty: globals.pretty ?? stdoutIsTty(), table: globals.table ?? false })}\n`);
}

function fail(envelope: { error: { code: string; message: string } }, code = 1): never {
  process.stderr.write(`${JSON.stringify(envelope)}\n`);
  process.exit(code);
}

function settingsOrFail(globals: GlobalFlags, needsKey: boolean): Settings {
  const settings = resolveSettings({ apiKey: globals.apiKey, apiUrl: globals.apiUrl });
  if (needsKey && !settings.apiKey) {
    fail({ error: { code: 'no_api_key', message: 'No API key. Run `mentio auth:set --key mk_live_...`, set MENTIO_API_KEY, or pass --api-key.' } }, 2);
  }
  return settings;
}

function addFieldOption(command: Command, field: CliField): void {
  const option = new Option(`--${field.name} <value>`, flagHelp(field));
  if (field.enum && field.type !== 'array') option.choices(field.nullable ? [...field.enum, 'null'] : field.enum);
  command.addOption(option);
}

function registerOperation(op: CliOperation): void {
  const name = commandName(op);
  const command = program.command(name).description(op.summary).summary(op.summary);
  if (op.description) command.addHelpText('after', `\n${op.description}\n`);
  for (const param of op.params.filter((p) => p.in === 'path')) command.argument(`<${param.name}>`, param.description ?? '');
  for (const param of op.params.filter((p) => p.in === 'query')) addFieldOption(command, param);
  if (op.body) {
    for (const field of op.body.fields) addFieldOption(command, field);
    command.option('--json <object>', 'The whole body as JSON; flags override its fields. "-" reads stdin.');
  }
  if (op.response === 'csv') command.option('--out <file>', 'Write the CSV to a file instead of stdout.');
  command.action(async (...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    const positional = args.slice(0, -2) as string[];
    const flags = cmd.opts<Record<string, unknown>>();
    const globals = program.opts<GlobalFlags>();
    try {
      let jsonBody = typeof flags.json === 'string' ? flags.json : undefined;
      if (jsonBody === '-') jsonBody = await readStdin();
      const request = buildRequest(op, positional, flags, jsonBody);
      const settings = settingsOrFail(globals, op.operationId !== 'getHealth');
      const outcome = await runOperation(clientFor(settings), op, request);
      if (!outcome.ok) fail(errorEnvelope(outcome));
      if (op.response === 'csv') {
        const csv = typeof outcome.value === 'string' ? outcome.value : '';
        if (typeof flags.out === 'string') {
          writeFileSync(flags.out, csv);
          print({ ok: true, file: flags.out, bytes: Buffer.byteLength(csv) }, globals);
        } else {
          process.stdout.write(csv);
        }
        return;
      }
      print(outcome.value === undefined ? { ok: true, status: outcome.status } : outcome.value, globals);
    } catch (err) {
      if (err instanceof UsageError) fail({ error: { code: 'usage', message: err.message } }, 2);
      throw err;
    }
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function registerAuth(): void {
  program
    .command('auth:login')
    .description('Sign in through the browser: the dashboard mints an API key and hands it to this terminal')
    .option('--app-url <url>', 'Dashboard URL', DEFAULT_APP_URL)
    .option('--name <label>', 'Name of the key the dashboard creates', `CLI on ${hostname()}`)
    .addOption(new Option('--scope <scope>', 'read: GET only. write: everything.').choices(['read', 'write']).default('write'))
    .option('--timeout <seconds>', 'How long to wait for the browser', '300')
    .option('--no-open', 'Print the URL instead of opening the browser')
    .action(async (flags: { appUrl: string; name: string; scope: 'read' | 'write'; timeout: string; open: boolean }) => {
      const globals = program.opts<GlobalFlags>();
      const seconds = Number(flags.timeout);
      if (!Number.isFinite(seconds) || seconds < 10) fail({ error: { code: 'usage', message: '--timeout must be at least 10 seconds' } }, 2);
      const state = newState();
      const server = await startCallbackServer(state, seconds * 1000);
      const url = loginUrl(flags.appUrl, { port: server.port, state, name: flags.name, scope: flags.scope });
      const opened = flags.open ? openBrowser(url) : false;
      process.stderr.write(`${opened ? 'Opening your browser to authorize the CLI. If it does not open, visit:' : 'Open this URL to authorize the CLI:'}\n  ${url}\nWaiting for the browser (${seconds}s)...\n`);
      let key: string;
      try {
        key = await server.key;
      } catch (err) {
        fail({ error: { code: 'login_failed', message: err instanceof LoginError ? err.message : String(err) } });
      }
      const path = writeConfig({ apiKey: key, ...(globals.apiUrl ? { apiUrl: globals.apiUrl } : {}) });
      const settings = resolveSettings({ apiKey: key, apiUrl: globals.apiUrl });
      const result = await clientFor(settings).request({ method: 'GET', url: '/v1/company', security: BEARER, throwOnError: false });
      const company = result.error === undefined && result.response?.ok ? (result.data as { name?: string } | undefined) : undefined;
      print({ ok: true, workspace: company?.name ?? null, key: keyPrefix(key), scope: flags.scope, file: path }, globals);
    });
  program
    .command('auth:set')
    .description('Store an API key (and optionally the API host) in ~/.mentio/config.json')
    .requiredOption('--key <key>', 'API key from the dashboard or POST /v1/api-keys (mk_live_...)')
    .option('--url <url>', 'API host for a self-hosted deployment')
    .action((flags: { key: string; url?: string }) => {
      const path = writeConfig({ apiKey: flags.key, ...(flags.url ? { apiUrl: flags.url } : {}) });
      print({ ok: true, file: path, key: keyPrefix(flags.key) }, program.opts<GlobalFlags>());
    });
  program
    .command('auth:logout')
    .description('Remove the stored API key')
    .action(() => {
      const path = writeConfig({ apiKey: null });
      print({ ok: true, file: path }, program.opts<GlobalFlags>());
    });
  program
    .command('auth:check')
    .description('Verify the key: which workspace it belongs to and where it came from')
    .action(async () => {
      const globals = program.opts<GlobalFlags>();
      const settings = settingsOrFail(globals, true);
      const result = await clientFor(settings).request({ method: 'GET', url: '/v1/company', security: BEARER, throwOnError: false });
      if (result.error !== undefined || !result.response?.ok) {
        fail(errorEnvelope({ ok: false, status: result.response?.status ?? 0, value: result.error }));
      }
      const company = result.data as { name?: string } | undefined;
      print({ ok: true, workspace: company?.name ?? null, key: keyPrefix(settings.apiKey ?? ''), source: settings.source, apiUrl: settings.apiUrl }, globals);
    });
}

function registerWatch(): void {
  const search = OPERATIONS.find((op) => op.operationId === 'searchMentions');
  if (!search) return;
  const command = program
    .command('mentions:watch')
    .description('Follow the feed: print each new mention as one JSON line (tail -f for mentions)')
    .option('--interval <seconds>', 'Seconds between polls', '30')
    .option('--from-start', 'Print the current newest page first instead of only what arrives next');
  const skip = new Set(['cursor', 'limit', 'sort', 'since', 'until']);
  const filters = search.params.filter((p) => p.in === 'query' && !skip.has(p.name));
  for (const param of filters) addFieldOption(command, param);
  command.action(async (flags: Record<string, unknown>) => {
    const globals = program.opts<GlobalFlags>();
    const settings = settingsOrFail(globals, true);
    const query: Record<string, string | number | boolean> = {};
    try {
      for (const param of filters) {
        const raw = flags[param.name];
        if (raw === undefined) continue;
        const value = coerce(param, String(raw));
        if (value !== null && typeof value !== 'object') query[param.name] = value;
      }
    } catch (err) {
      if (err instanceof UsageError) fail({ error: { code: 'usage', message: err.message } }, 2);
      throw err;
    }
    const seconds = Number(flags.interval);
    if (!Number.isFinite(seconds) || seconds < 5) fail({ error: { code: 'usage', message: '--interval must be at least 5 seconds' } }, 2);
    const controller = new AbortController();
    process.on('SIGINT', () => controller.abort());
    process.on('SIGTERM', () => controller.abort());
    await watchMentions({
      client: clientFor(settings),
      query,
      intervalMs: seconds * 1000,
      fromStart: flags.fromStart === true,
      write: (line) => process.stdout.write(`${line}\n`),
      warn: (line) => process.stderr.write(`${line}\n`),
      signal: controller.signal,
    });
  });
}

function registerMcp(): void {
  program
    .command('mcp:config')
    .description('Print the MCP client configuration for the Mentio MCP server, key included')
    .addOption(new Option('--client <kind>', 'Which client to print for').choices(['claude', 'cursor', 'vscode', 'generic']).default('claude'))
    .option('--url <url>', 'MCP server URL', DEFAULT_MCP_URL)
    .action((flags: { client: McpClientKind; url: string }) => {
      const globals = program.opts<GlobalFlags>();
      const settings = resolveSettings({ apiKey: globals.apiKey, apiUrl: globals.apiUrl });
      const key = settings.apiKey ?? 'mk_live_...';
      if (!settings.apiKey) process.stderr.write('No API key configured; printing a placeholder. Run `mentio auth:set --key ...` first.\n');
      process.stdout.write(`${mcpConfig(flags.client, flags.url, key)}\n`);
    });
}

program
  .name('mentio')
  .description('Command line for the Mentio API. Commands are noun:verb; every endpoint has one.')
  .version(pkg.version, '-V, --version')
  .option('--api-key <key>', 'API key (overrides MENTIO_API_KEY and the stored key)')
  .option('--api-url <url>', 'API host (overrides MENTIO_API_URL and the stored host)')
  .option('--pretty', 'Indent JSON output (the default on a terminal)')
  .option('--table', 'Render lists as a table')
  .showHelpAfterError('(run with --help for usage)')
  .configureHelp({ sortSubcommands: true });

registerAuth();
for (const op of OPERATIONS) registerOperation(op);
registerWatch();
registerMcp();

program.parseAsync(process.argv).catch((err: unknown) => {
  fail({ error: { code: 'internal_error', message: err instanceof Error ? err.message : String(err) } });
});
