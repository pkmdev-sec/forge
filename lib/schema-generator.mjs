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

  // Prevent infinite recursion in nested array types
  const depth = (trimmed.match(/</g) || []).length;
  if (depth > 10) {
    throw new Error('Type nesting depth exceeded (max 10 levels)');
  }

  // Handle array<innerType>
  const arrayMatch = trimmed.match(/^(?:array|list)<\s*(.+?)\s*>$/);
  if (arrayMatch) {
    const innerType = arrayMatch[1].trim();
    if (!innerType) {
      throw new Error('Array type must specify inner type: array<type>');
    }
    return {
      type: 'array',
      items: resolveType(innerType),
    };
  }

  // Handle enum:val1,val2,val3
  const enumMatch = trimmed.match(/^enum:\s*(.+)$/);
  if (enumMatch) {
    const values = enumMatch[1].split(',').map(v => v.trim()).filter(v => v);
    if (values.length === 0) {
      throw new Error('Enum type must have at least one value');
    }
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
  try {
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
      if (!name || typeof name !== 'string') {
        throw new Error('Parameter name must be a non-empty string');
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error(`Invalid parameter name "${name}": must start with letter/underscore and contain only alphanumeric or underscore`);
      }

      const prop = { ...resolveType(def.type || 'string') };

      if (def.description) {
        if (typeof def.description !== 'string') {
          throw new Error(`Parameter "${name}" description must be a string`);
        }
        prop.description = def.description;
      }

      if (def.default !== undefined) prop.default = def.default;

      // Validate numeric constraints
      if (def.minimum !== undefined) {
        if (typeof def.minimum !== 'number') {
          throw new Error(`Parameter "${name}" minimum must be a number`);
        }
        prop.minimum = def.minimum;
      }

      if (def.maximum !== undefined) {
        if (typeof def.maximum !== 'number') {
          throw new Error(`Parameter "${name}" maximum must be a number`);
        }
        prop.maximum = def.maximum;
      }

      if (def.pattern) {
        if (typeof def.pattern !== 'string') {
          throw new Error(`Parameter "${name}" pattern must be a string`);
        }
        // Validate regex pattern
        try {
          new RegExp(def.pattern);
        } catch (err) {
          throw new Error(`Parameter "${name}" has invalid regex pattern: ${err.message}`);
        }
        prop.pattern = def.pattern;
      }

      if (def.minLength !== undefined) {
        if (typeof def.minLength !== 'number' || def.minLength < 0) {
          throw new Error(`Parameter "${name}" minLength must be a non-negative number`);
        }
        prop.minLength = def.minLength;
      }

      if (def.maxLength !== undefined) {
        if (typeof def.maxLength !== 'number' || def.maxLength < 0) {
          throw new Error(`Parameter "${name}" maxLength must be a non-negative number`);
        }
        prop.maxLength = def.maxLength;
      }

      properties[name] = prop;

      if (def.required !== false && def.required !== undefined && def.required) {
        required.push(name);
      }
    }

    // Validate generated schema structure
    const schema = {
      type: 'object',
      properties,
      required,
    };

    // Ensure it's valid JSON Schema
    if (required.length > 0 && Object.keys(properties).length === 0) {
      throw new Error('Cannot have required fields without properties');
    }

    return schema;
  } catch (err) {
    throw new Error(`Failed to generate input schema: ${err.message}`);
  }
}

/**
 * Generate a complete MCP tool schema from a tool definition object.
 * @param {Object} toolDef - { name, description, parameters }
 * @returns {Object} MCP-compatible tool schema
 */
export function generateToolSchema(toolDef) {
  try {
    if (!toolDef || !toolDef.name) {
      throw new Error('Tool definition must include a name');
    }

    if (typeof toolDef.name !== 'string' || !toolDef.name.trim()) {
      throw new Error('Tool name must be a non-empty string');
    }

    const schema = {
      name: toolDef.name,
      description: toolDef.description || '',
      inputSchema: generateInputSchema(toolDef.parameters),
    };

    // Validate the schema is serializable as JSON
    try {
      JSON.stringify(schema);
    } catch (err) {
      throw new Error(`Generated schema is not valid JSON: ${err.message}`);
    }

    return schema;
  } catch (err) {
    throw new Error(`Failed to generate tool schema: ${err.message}`);
  }
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
