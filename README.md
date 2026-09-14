# Mentio CLI

[![npm](https://img.shields.io/npm/v/@mentio-dev/cli?label=npm)](https://www.npmjs.com/package/@mentio-dev/cli)
[![license](https://img.shields.io/npm/l/@mentio-dev/cli)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.mentio.dev%2Fcli-1421b9)](https://docs.mentio.dev/cli)

`mentio` is the [Mentio API](https://docs.mentio.dev) on the command line: every endpoint as a `noun:verb` command, generated from the OpenAPI document, plus a live mentions feed and MCP helpers. Mentio watches Reddit, Hacker News, X, GitHub, Bluesky, LinkedIn, Stack Overflow, DEV, YouTube and news for your keywords and scores every mention for relevance, sentiment and intent. Node 22+.

## Installation

```bash
npm install -g @mentio-dev/cli
# or run it without installing
npx @mentio-dev/cli --help
```

## Quick start

```bash
mentio auth:login                                   # signs in through the browser and stores a key
mentio keywords:create --term "acme cloud" --kind brand --platforms reddit,x
mentio mentions:search --relevant true --intent buy_intent --limit 20
mentio mentions:update mm_7f3a... --status done --note "replied 2026-09-14"
mentio analytics:summary --range 7d --compare true
mentio mentions:watch --platform reddit | jq -r '.post.url'
```

Output is JSON: compact when piped, indented on a terminal, `--table` for lists.

## Authentication

Three ways, in order of precedence:

```bash
mentio keywords:list --api-key mk_live_...    # one command
export MENTIO_API_KEY=mk_live_...             # the shell
mentio auth:set --key mk_live_...             # stored for this machine; auth:login does this for you
```

`mentio auth:login` opens the dashboard, which mints a key named after your machine and hands it back to the CLI on a loopback port. `--api-url` or `MENTIO_API_URL` point the CLI at another deployment.

## Commands

Generated commands take every query parameter and body field as a flag. `--json '{...}'` sends a whole body (`-` reads stdin) and flags override its fields. Exports take `--out file.csv`.

| Group | Commands |
| --- | --- |
| `keywords` | `create`, `list`, `get`, `update`, `delete` |
| `mentions` | `search`, `get`, `update`, `export`, `watch` |
| `people` | `list`, `get`, `update`, `merge`, `split`, `export` |
| `segments` | `list`, `create`, `get`, `update`, `delete` |
| `alerts` | `list`, `create`, `get`, `update`, `delete`, `test`, `run` |
| `channels` | `list`, `create`, `get`, `update`, `delete`, `test`, `rotate-secret`, `deliveries` |
| `analytics` | `summary`, `series`, `breakdown`, `share-of-voice` |
| `company` | `get`, `update` |
| `api-keys` | `create`, `list`, `revoke` |
| `system` | `health` |
| `auth` | `login`, `set`, and friends |
| `mcp` | `config` |

`mentio <group>:<verb> --help` prints every flag with the description from the API reference. Every command, by area, is documented at [docs.mentio.dev/cli](https://docs.mentio.dev/cli).

## A live feed

```bash
mentio mentions:watch --platform reddit --intent question --interval 30
```

Polls the API and prints each new mention as one JSON line, so it pipes into `jq`, a file, or anything that reads stdin. `--from-start` prints the current newest page first.

## MCP helpers

```bash
mentio mcp:config          # the JSON block for Claude, Cursor, VS Code or a generic MCP client
```

Or skip the CLI and add the server directly in Claude Code:

```bash
claude mcp add --transport http mentio https://mcp.mentio.dev/mcp
```

## Errors

A non-2xx prints the API's error envelope on stderr, `{ "error": { "code", "message", "requestId" } }`, and exits non-zero. The codes are stable and listed at [docs.mentio.dev/errors](https://docs.mentio.dev/errors).

## Requirements

- Node 22+
- A Mentio API key (every account starts with $5.80 of credit, no card)

## Links

- [Documentation](https://docs.mentio.dev) and the [CLI guide](https://docs.mentio.dev/cli)
- [API reference](https://docs.mentio.dev/api/keywords/create-keyword)
- [Dashboard](https://app.mentio.dev)
- [TypeScript SDK](https://github.com/mentio-dev/sdk), [Python SDK](https://github.com/mentio-dev/sdk-python), [Claude Code skills](https://github.com/mentio-dev/claude-skills)

This repository is published from the Mentio monorepo on every release.

## License

MIT.
