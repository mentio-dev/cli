/**
 * How an API operation becomes a CLI command: `noun:verb`, the noun being
 * the resource in the path and the verb the action, so the CLI reads like
 * the REST API and like the Zernio CLI. Pure, so the docs can generate the
 * commands page from the same rule.
 *
 *   GET    /v1/keywords                 -> keywords:list
 *   GET    /v1/mentions                 -> mentions:search   (operationId starts with search)
 *   POST   /v1/keywords                 -> keywords:create
 *   GET    /v1/keywords/{id}            -> keywords:get
 *   PATCH  /v1/keywords/{id}            -> keywords:update
 *   DELETE /v1/api-keys/{id}            -> api-keys:revoke  (operationId starts with revoke)
 *   POST   /v1/people/{id}/merge        -> people:merge
 *   GET    /v1/channels/{id}/deliveries -> channels:deliveries
 *   GET    /v1/analytics/summary        -> analytics:summary
 *   GET    /v1/mentions/export.csv      -> mentions:export
 *   GET    /v1/company                  -> company:get
 *   GET    /v1/health                   -> system:health
 */
export interface OperationRef {
  operationId: string;
  method: string;
  path: string;
}

export function commandName(op: OperationRef): string {
  const segments = op.path.replace(/^\/v1\//, '').split('/');
  const noun = segments[0] ?? '';
  if (noun === 'health') return 'system:health';
  const rest = segments.slice(1);
  const hasId = rest.some((s) => s.startsWith('{'));
  const action = rest.find((s) => !s.startsWith('{'));
  const method = op.method.toLowerCase();
  let verb: string;
  if (action !== undefined) {
    verb = action === 'export.csv' ? 'export' : action;
  } else if (method === 'get' && !hasId) {
    verb = op.operationId.startsWith('search') ? 'search' : noun === 'company' ? 'get' : 'list';
  } else if (method === 'post' && !hasId) {
    verb = 'create';
  } else if (method === 'get') {
    verb = 'get';
  } else if (method === 'patch') {
    verb = 'update';
  } else if (method === 'delete') {
    verb = op.operationId.startsWith('revoke') ? 'revoke' : 'delete';
  } else {
    verb = method;
  }
  return `${noun}:${verb}`;
}

/** The group a command is listed under in --help and in the docs. */
export function commandGroup(name: string): string {
  return name.split(':')[0] ?? name;
}
