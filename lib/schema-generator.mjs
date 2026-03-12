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
 * Resolve a type definition to a JSON Schema fragment.
 * Supports:
 * - Basic types: "string", "number", "integer", "boolean", "array", "object"
 * - Array types: "array<string>", "list<integer>"
 * - Nested arrays: "array<array<string>>"
 * - Enum types: "enum:val1,val2,val3"
 * - Object definitions with properties
 * @param {string|Object} typeDef - Type string or object definition
 * @returns {Object} JSON Schema fragment
 */
export function resolveType(typeDef, depth = 0) {
  // Prevent infinite recursion
  if (depth > 20) {
    throw new Error('Type nesting depth exceeded (max 20 levels)');
  }

  // Handle null/undefined early
  if (!typeDef) {
    return { type: 'string' };
  }

  // Handle object definitions with properties
  if (typeof typeDef === 'object' && !Array.isArray(typeDef)) {
    if (typeDef.type === 'object' && typeDef.properties) {
      // Nested object with properties
      const schema = { type: 'object', properties: {} };
      const required = [];

      for (const [propName, propDef] of Object.entries(typeDef.properties)) {
        schema.properties[propName] = resolveType(propDef, depth + 1);
        if (propDef.required === true) {
          required.push(propName);
        }
      }

      if (required.length > 0) {
        schema.required = required;
      }

      return schema;
    }

    if (typeDef.type === 'array' && typeDef.items) {
      // Array with explicit item schema
      return {
        type: 'array',
        items: resolveType(typeDef.items, depth + 1),
      };
    }

    if (typeDef.oneOf) {
      // oneOf support
      return {
        oneOf: typeDef.oneOf.map(t => resolveType(t, depth + 1)),
      };
    }

    if (typeDef.anyOf) {
      // anyOf support
      return {
        anyOf: typeDef.anyOf.map(t => resolveType(t, depth + 1)),
      };
    }

    // If it has a type property, use it
    if (typeDef.type) {
      return resolveType(typeDef.type, depth + 1);
    }
  }

  // Handle string type definitions
  if (!typeDef || typeof typeDef !== 'string') {
    return { type: 'string' };
  }

  const trimmed = typeDef.trim().toLowerCase();

  // Handle array<innerType>
  const arrayMatch = trimmed.match(/^(?:array|list)<\s*(.+?)\s*>$/);
  if (arrayMatch) {
    const innerType = arrayMatch[1].trim();
    if (!innerType) {
      throw new Error('Array type must specify inner type: array<type>');
    }
    return {
      type: 'array',
      items: resolveType(innerType, depth + 1),
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
 * Supports nested objects, arrays with item schemas, enums, oneOf/anyOf.
 * @param {Object} paramsDef - { paramName: { type, description, required, default, properties, items, enum, oneOf, anyOf } }
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

      // Resolve type with support for nested objects and arrays
      let prop;
      if (def.properties) {
        // Nested object definition
        prop = {
          type: 'object',
          properties: {},
        };
        const nestedRequired = [];
        for (const [nestedName, nestedDef] of Object.entries(def.properties)) {
          prop.properties[nestedName] = { ...resolveType(nestedDef.type || nestedDef) };
          if (nestedDef.description) {
            prop.properties[nestedName].description = nestedDef.description;
          }
          if (nestedDef.required === true) {
            nestedRequired.push(nestedName);
          }
        }
        if (nestedRequired.length > 0) {
          prop.required = nestedRequired;
        }
      } else if (def.items) {
        // Array with explicit item schema
        prop = {
          type: 'array',
          items: resolveType(def.items),
        };
      } else if (def.enum) {
        // Explicit enum definition
        if (!Array.isArray(def.enum) || def.enum.length === 0) {
          throw new Error(`Parameter "${name}" enum must be a non-empty array`);
        }
        prop = {
          type: def.type || 'string',
          enum: def.enum,
        };
      } else if (def.oneOf) {
        // oneOf schema
        if (!Array.isArray(def.oneOf) || def.oneOf.length === 0) {
          throw new Error(`Parameter "${name}" oneOf must be a non-empty array`);
        }
        prop = {
          oneOf: def.oneOf.map(t => resolveType(t)),
        };
      } else if (def.anyOf) {
        // anyOf schema
        if (!Array.isArray(def.anyOf) || def.anyOf.length === 0) {
          throw new Error(`Parameter "${name}" anyOf must be a non-empty array`);
        }
        prop = {
          anyOf: def.anyOf.map(t => resolveType(t)),
        };
      } else {
        // Standard type resolution
        prop = { ...resolveType(def.type || 'string') };
      }

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

      // Array-specific constraints
      if (def.minItems !== undefined) {
        if (typeof def.minItems !== 'number' || def.minItems < 0) {
          throw new Error(`Parameter "${name}" minItems must be a non-negative number`);
        }
        prop.minItems = def.minItems;
      }

      if (def.maxItems !== undefined) {
        if (typeof def.maxItems !== 'number' || def.maxItems < 0) {
          throw new Error(`Parameter "${name}" maxItems must be a non-negative number`);
        }
        prop.maxItems = def.maxItems;
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

    // Validate against JSON Schema spec
    validateJsonSchema(schema);

    return schema;
  } catch (err) {
    throw new Error(`Failed to generate input schema: ${err.message}`);
  }
}

/**
 * Validate a schema against basic JSON Schema spec requirements.
 * @param {Object} schema - Schema to validate
 */
function validateJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Schema must be an object');
  }

  // Validate type field if present
  if (schema.type && !['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'].includes(schema.type)) {
    throw new Error(`Invalid JSON Schema type: ${schema.type}`);
  }

  // Validate properties structure for objects
  if (schema.type === 'object' && schema.properties) {
    if (typeof schema.properties !== 'object') {
      throw new Error('Schema properties must be an object');
    }
    // Recursively validate nested schemas
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      validateJsonSchema(propSchema);
    }
  }

  // Validate items for arrays
  if (schema.type === 'array' && schema.items) {
    validateJsonSchema(schema.items);
  }

  // Validate oneOf/anyOf
  if (schema.oneOf) {
    if (!Array.isArray(schema.oneOf)) {
      throw new Error('oneOf must be an array');
    }
    schema.oneOf.forEach(s => validateJsonSchema(s));
  }

  if (schema.anyOf) {
    if (!Array.isArray(schema.anyOf)) {
      throw new Error('anyOf must be an array');
    }
    schema.anyOf.forEach(s => validateJsonSchema(s));
  }

  // Validate enum
  if (schema.enum && !Array.isArray(schema.enum)) {
    throw new Error('enum must be an array');
  }

  // Ensure schema is serializable
  try {
    JSON.stringify(schema);
  } catch (err) {
    throw new Error(`Schema is not JSON serializable: ${err.message}`);
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
