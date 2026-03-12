/**
 * FORGE Schema Generator
 * Generate JSON schemas from simple descriptions or YAML tool definitions.
 */

const TYPE_MAP = {
  string: { type: 'string' },
  str: { type: 'string' },
  text: { type: 'string' },
  number: { type: 'number' },
  num: { type: 'number' },
  int: { type: 'integer' },
  integer: { type: 'integer' },
  bool: { type: 'boolean' },
  boolean: { type: 'boolean' },
  array: { type: 'array' },
  list: { type: 'array' },
  object: { type: 'object' },
  map: { type: 'object' },
};

/**
 * Resolve a simple type string to a JSON Schema fragment.
 * Supports "array<string>", "string", "object", etc.
 */
export function resolveType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') {
    return { type: 'string' };
  }

  const trimmed = typeStr.trim().toLowerCase();

  // Handle array<innerType>
  const arrayMatch = trimmed.match(/^(?:array|list)<\s*(.+?)\s*>$/);
  if (arrayMatch) {
    return {
      type: 'array',
      items: resolveType(arrayMatch[1]),
    };
  }

  // Handle enum:val1,val2,val3
  const enumMatch = trimmed.match(/^enum:\s*(.+)$/);
  if (enumMatch) {
    const values = enumMatch[1].split(',').map(v => v.trim());
    return { type: 'string', enum: values };
  }

  return TYPE_MAP[trimmed] || { type: 'string' };
}

/**
 * Generate a JSON Schema for MCP tool input from a parameters definition.
 * @param {Object} paramsDef - { paramName: { type, description, required, default } }
 * @returns {Object} JSON Schema object
 */
export function generateInputSchema(paramsDef) {
  if (!paramsDef || typeof paramsDef !== 'object') {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  const properties = {};
  const required = [];

  for (const [name, def] of Object.entries(paramsDef)) {
    const prop = { ...resolveType(def.type || 'string') };

    if (def.description) prop.description = def.description;
    if (def.default !== undefined) prop.default = def.default;
    if (def.minimum !== undefined) prop.minimum = def.minimum;
    if (def.maximum !== undefined) prop.maximum = def.maximum;
    if (def.pattern) prop.pattern = def.pattern;
    if (def.minLength !== undefined) prop.minLength = def.minLength;
    if (def.maxLength !== undefined) prop.maxLength = def.maxLength;

    properties[name] = prop;

    if (def.required !== false && def.required !== undefined && def.required) {
      required.push(name);
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Generate a complete MCP tool schema from a tool definition object.
 * @param {Object} toolDef - { name, description, parameters }
 * @returns {Object} MCP-compatible tool schema
 */
export function generateToolSchema(toolDef) {
  if (!toolDef || !toolDef.name) {
    throw new Error('Tool definition must include a name');
  }

  return {
    name: toolDef.name,
    description: toolDef.description || '',
    inputSchema: generateInputSchema(toolDef.parameters),
  };
}

/**
 * Generate schemas for multiple tools at once.
 * @param {Array<Object>} toolDefs - Array of tool definitions
 * @returns {Array<Object>} Array of MCP tool schemas
 */
export function generateMultipleSchemas(toolDefs) {
  if (!Array.isArray(toolDefs)) {
    throw new Error('Expected an array of tool definitions');
  }
  return toolDefs.map(generateToolSchema);
}

export default {
  resolveType,
  generateInputSchema,
  generateToolSchema,
  generateMultipleSchemas,
};
