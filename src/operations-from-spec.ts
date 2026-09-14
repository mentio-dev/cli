/**
 * OpenAPI document -> the flat operation table the CLI builds its commands
 * from. Pure and file-system free, so the CLI's generate script and the docs
 * build both derive the same table from the same document; only what a
 * command line needs survives: scalar types, enums, descriptions,
 * nullability.
 */
import type { CliField, CliOperation } from './operations-types';

export interface OpenApiSchema {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  nullable?: boolean;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  default?: unknown;
  $ref?: string;
}

export interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  responses?: Record<string, { content?: Record<string, unknown> }>;
}

export interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

export function operationsFromDocument(doc: OpenApiDocument): CliOperation[] {
  const deref = (schema: OpenApiSchema | undefined): OpenApiSchema | undefined => {
    if (!schema?.$ref) return schema;
    const name = schema.$ref.split('/').pop() ?? '';
    return doc.components?.schemas?.[name];
  };

  const fieldType = (schema: OpenApiSchema | undefined): CliField['type'] => {
    const s = deref(schema);
    if (!s) return 'string';
    const raw = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
    if (raw === 'integer' || raw === 'number' || raw === 'boolean' || raw === 'array' || raw === 'object') return raw;
    if (s.properties) return 'object';
    return 'string';
  };

  const enumOf = (schema: OpenApiSchema | undefined): string[] | undefined => {
    const s = deref(schema);
    const values = s?.enum ?? (s?.type === 'array' ? deref(s.items)?.enum : undefined);
    const strings = values?.filter((v): v is string => typeof v === 'string');
    return strings && strings.length > 0 ? strings : undefined;
  };

  const isNullable = (schema: OpenApiSchema | undefined): boolean => {
    const s = deref(schema);
    if (!s) return false;
    if (s.nullable) return true;
    return Array.isArray(s.type) && s.type.includes('null');
  };

  /** Top-level properties of a body, unions flattened (a discriminated union
   *  such as the channel kinds becomes one field set with `kind` an enum of
   *  every variant). */
  const bodyFields = (schema: OpenApiSchema | undefined): CliField[] => {
    const s = deref(schema);
    if (!s) return [];
    const variants = s.oneOf ?? s.anyOf ?? s.allOf;
    if (variants) {
      const merged = new Map<string, CliField>();
      for (const variant of variants) {
        for (const field of bodyFields(variant)) {
          const existing = merged.get(field.name);
          if (!existing) {
            merged.set(field.name, { ...field, required: false });
          } else if (field.enum) {
            existing.enum = [...new Set([...(existing.enum ?? []), ...field.enum])];
          }
        }
      }
      return [...merged.values()];
    }
    const required = new Set(s.required ?? []);
    return Object.entries(s.properties ?? {}).map(([name, prop]) => {
      const p = deref(prop);
      return {
        name,
        type: fieldType(prop),
        description: p?.description,
        enum: enumOf(prop),
        required: required.has(name),
        nullable: isNullable(prop),
        items: p?.type === 'array' ? fieldType(p.items) : undefined,
      };
    });
  };

  const operations: CliOperation[] = [];
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.operationId) continue;
      const ok = Object.entries(op.responses ?? {}).find(([code]) => code.startsWith('2'))?.[1];
      const contentTypes = Object.keys(ok?.content ?? {});
      const response: CliOperation['response'] = contentTypes.some((t) => t.includes('csv'))
        ? 'csv'
        : contentTypes.some((t) => t.includes('json'))
          ? 'json'
          : 'none';
      const params: CliField[] = (op.parameters ?? [])
        .filter((p) => p.in === 'query' || p.in === 'path')
        .map((p) => ({
          name: p.name,
          in: p.in as 'query' | 'path',
          type: fieldType(p.schema),
          description: p.description,
          enum: enumOf(p.schema),
          required: p.required === true,
          nullable: false,
          items: undefined,
        }));
      const bodySchema = op.requestBody?.content?.['application/json']?.schema;
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? op.operationId,
        description: op.description,
        tag: op.tags?.[0] ?? 'Other',
        params,
        body: bodySchema ? { description: deref(bodySchema)?.description, fields: bodyFields(bodySchema) } : null,
        response,
      });
    }
  }
  return operations;
}
