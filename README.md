# @mentio-dev/cli

`mentio` is the [Mentio API](https://docs.mentio.dev) on the command line: every endpoint as a `noun:verb` command generated from the OpenAPI document, plus `mentions:watch` (a live feed as JSON lines) and `mcp:config`. Node 22+.

```bash
npm install -g @mentio-dev/cli
mentio auth:login
mentio keywords:create --term "acme" --kind brand
mentio mentions:search --relevant true --sentiment negative --limit 20
mentio mentions:update mm_7f3a... --status done
mentio analytics:summary --range 7d --compare true
mentio mentions:watch --platform reddit | jq -r '.post.url'
```

JSON out, compact when piped and indented on a terminal; `--table` for lists. `mentio auth:login` signs in through the browser; keys also come from `--api-key`, `MENTIO_API_KEY`, or `mentio auth:set`. Every command, by area, is at [docs.mentio.dev/cli](https://docs.mentio.dev/cli).
