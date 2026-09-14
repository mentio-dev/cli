/** The slice of an OpenAPI operation a command line needs. Produced by
 *  scripts/generate-operations.ts into ./generated/operations.ts. */
export interface CliField {
  name: string;
  /** Where a parameter travels; absent for body fields. */
  in?: 'query' | 'path';
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  required: boolean;
  /** Body fields only: the literal `null` clears the field. */
  nullable: boolean;
  /** Arrays: the element type. */
  items?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
}

export interface CliOperation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  tag: string;
  params: CliField[];
  body: { description?: string; fields: CliField[] } | null;
  response: 'json' | 'csv' | 'none';
}
