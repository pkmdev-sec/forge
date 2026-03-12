import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveType,
  generateInputSchema,
  generateToolSchema,
  generateMultipleSchemas,
} from '../lib/schema-generator.mjs';

describe('resolveType', () => {
  it('should resolve basic string types', () => {
    assert.deepStrictEqual(resolveType('string'), { type: 'string' });
    assert.deepStrictEqual(resolveType('str'), { type: 'string' });
    assert.deepStrictEqual(resolveType('text'), { type: 'string' });
  });

  it('should resolve numeric types', () => {
    assert.deepStrictEqual(resolveType('number'), { type: 'number' });
    assert.deepStrictEqual(resolveType('num'), { type: 'number' });
    assert.deepStrictEqual(resolveType('integer'), { type: 'integer' });
    assert.deepStrictEqual(resolveType('int'), { type: 'integer' });
  });

  it('should resolve boolean types', () => {
    assert.deepStrictEqual(resolveType('boolean'), { type: 'boolean' });
    assert.deepStrictEqual(resolveType('bool'), { type: 'boolean' });
  });

  it('should resolve array and object types', () => {
    assert.deepStrictEqual(resolveType('array'), { type: 'array' });
    assert.deepStrictEqual(resolveType('object'), { type: 'object' });
    assert.deepStrictEqual(resolveType('list'), { type: 'array' });
    assert.deepStrictEqual(resolveType('map'), { type: 'object' });
  });

  it('should resolve array<innerType> syntax', () => {
    assert.deepStrictEqual(resolveType('array<string>'), {
      type: 'array',
      items: { type: 'string' },
    });
    assert.deepStrictEqual(resolveType('list<integer>'), {
      type: 'array',
      items: { type: 'integer' },
    });
  });

  it('should resolve enum:val1,val2 syntax', () => {
    const result = resolveType('enum:json,csv,table');
    assert.deepStrictEqual(result, {
      type: 'string',
      enum: ['json', 'csv', 'table'],
    });
  });

  it('should default to string for unknown types', () => {
    assert.deepStrictEqual(resolveType('foobar'), { type: 'string' });
    assert.deepStrictEqual(resolveType(null), { type: 'string' });
    assert.deepStrictEqual(resolveType(undefined), { type: 'string' });
  });

  it('should handle case insensitivity', () => {
    assert.deepStrictEqual(resolveType('STRING'), { type: 'string' });
    assert.deepStrictEqual(resolveType('Boolean'), { type: 'boolean' });
    assert.deepStrictEqual(resolveType('Array<String>'), {
      type: 'array',
      items: { type: 'string' },
    });
  });
});

describe('generateInputSchema', () => {
  it('should generate schema from parameter definitions', () => {
    const result = generateInputSchema({
      name: { type: 'string', description: 'The name', required: true },
      age: { type: 'integer', description: 'The age', required: false },
    });

    assert.strictEqual(result.type, 'object');
    assert.strictEqual(result.properties.name.type, 'string');
    assert.strictEqual(result.properties.name.description, 'The name');
    assert.strictEqual(result.properties.age.type, 'integer');
    assert.deepStrictEqual(result.required, ['name']);
  });

  it('should handle empty/null input', () => {
    const result = generateInputSchema(null);
    assert.deepStrictEqual(result, { type: 'object', properties: {}, required: [] });
  });

  it('should include constraints', () => {
    const result = generateInputSchema({
      count: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 25,
        required: true,
      },
    });
    assert.strictEqual(result.properties.count.minimum, 1);
    assert.strictEqual(result.properties.count.maximum, 100);
    assert.strictEqual(result.properties.count.default, 25);
  });

  it('should include string constraints', () => {
    const result = generateInputSchema({
      query: {
        type: 'string',
        pattern: '^SELECT',
        minLength: 5,
        maxLength: 1000,
        required: true,
      },
    });
    assert.strictEqual(result.properties.query.pattern, '^SELECT');
    assert.strictEqual(result.properties.query.minLength, 5);
    assert.strictEqual(result.properties.query.maxLength, 1000);
  });
});

describe('generateToolSchema', () => {
  it('should generate a complete tool schema', () => {
    const result = generateToolSchema({
      name: 'my-tool',
      description: 'A test tool',
      parameters: {
        input: { type: 'string', description: 'Input value', required: true },
      },
    });

    assert.strictEqual(result.name, 'my-tool');
    assert.strictEqual(result.description, 'A test tool');
    assert.strictEqual(result.inputSchema.type, 'object');
    assert.ok(result.inputSchema.properties.input);
  });

  it('should throw for missing name', () => {
    assert.throws(() => generateToolSchema({}), /must include a name/);
    assert.throws(() => generateToolSchema(null), /must include a name/);
  });

  it('should handle tool with no parameters', () => {
    const result = generateToolSchema({ name: 'simple', description: 'No params' });
    assert.strictEqual(result.name, 'simple');
    assert.deepStrictEqual(result.inputSchema.properties, {});
  });
});

describe('generateMultipleSchemas', () => {
  it('should generate schemas for multiple tools', () => {
    const results = generateMultipleSchemas([
      { name: 'tool1', description: 'First' },
      { name: 'tool2', description: 'Second' },
    ]);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].name, 'tool1');
    assert.strictEqual(results[1].name, 'tool2');
  });

  it('should throw for non-array input', () => {
    assert.throws(() => generateMultipleSchemas('not-array'), /Expected an array/);
  });
});
