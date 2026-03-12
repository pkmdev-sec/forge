import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  validateToolDefinition,
  buildHandler,
  buildTool,
  loadToolDefinition,
} from '../lib/tool-builder.mjs';

const TEMPLATES_DIR = resolve(import.meta.dirname, '..', 'templates');

describe('validateToolDefinition', () => {
  it('should validate a correct definition', () => {
    const result = validateToolDefinition({
      name: 'my-tool',
      description: 'A valid tool',
      parameters: { input: { type: 'string' } },
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should reject missing name', () => {
    const result = validateToolDefinition({ description: 'No name' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('should reject missing description', () => {
    const result = validateToolDefinition({ name: 'test' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('description')));
  });

  it('should reject invalid tool name format', () => {
    const result = validateToolDefinition({ name: '123-bad', description: 'bad' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name must start')));
  });

  it('should accept name with underscore prefix', () => {
    const result = validateToolDefinition({ name: '_private_tool', description: 'ok' });
    assert.strictEqual(result.valid, true);
  });

  it('should reject null definition', () => {
    const result = validateToolDefinition(null);
    assert.strictEqual(result.valid, false);
  });

  it('should reject non-object parameters', () => {
    const result = validateToolDefinition({
      name: 'test',
      description: 'test',
      parameters: 'bad',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('parameters')));
  });
});

describe('buildHandler', () => {
  it('should create a default handler when no handler specified', async () => {
    const handler = buildHandler({ name: 'test' });
    const result = await handler({ key: 'value' });
    assert.ok(result.content[0].text.includes('test'));
    assert.ok(result.content[0].text.includes('key'));
  });

  it('should create a shell handler', async () => {
    const handler = buildHandler({
      name: 'echo-tool',
      handler: 'echo {{message}}',
      handler_type: 'shell',
    });
    const result = await handler({ message: 'hello' });
    assert.strictEqual(result.content[0].text, 'hello');
  });

  it('should sanitize shell arguments', async () => {
    const handler = buildHandler({
      name: 'echo-tool',
      handler: 'echo {{message}}',
      handler_type: 'shell',
    });
    const result = await handler({ message: 'hello; rm -rf /' });
    // Semicolons should be stripped
    assert.ok(!result.content[0].text.includes(';'));
  });

  it('should handle shell errors gracefully', async () => {
    const handler = buildHandler({
      name: 'fail-tool',
      handler: 'false',
      handler_type: 'shell',
    });
    const result = await handler({});
    assert.strictEqual(result.isError, true);
  });

  it('should throw for unsupported handler type', () => {
    assert.throws(
      () => buildHandler({ name: 'test', handler: 'cmd', handler_type: 'unknown' }),
      /Unsupported handler type/
    );
  });
});

describe('loadToolDefinition', () => {
  it('should load a YAML template', () => {
    const def = loadToolDefinition(resolve(TEMPLATES_DIR, 'jira-tool.yaml'));
    assert.strictEqual(def.name, 'jira-search');
    assert.ok(def.parameters);
    assert.ok(def.description);
  });

  it('should throw for missing file', () => {
    assert.throws(
      () => loadToolDefinition('/nonexistent/path.yaml'),
      /not found/
    );
  });
});

describe('buildTool', () => {
  it('should build a tool from an object definition', () => {
    const result = buildTool({
      name: 'test-tool',
      description: 'A test tool',
      handler: 'echo test',
      handler_type: 'shell',
      parameters: {
        input: { type: 'string', description: 'Input', required: true },
      },
    });
    assert.ok(result.schema);
    assert.ok(result.handler);
    assert.ok(result.definition);
    assert.strictEqual(result.schema.name, 'test-tool');
  });

  it('should build a tool from a YAML file', () => {
    const result = buildTool(resolve(TEMPLATES_DIR, 'db-query-tool.yaml'));
    assert.strictEqual(result.schema.name, 'db-query');
    assert.ok(result.schema.inputSchema.properties.query);
  });

  it('should throw for invalid definition', () => {
    assert.throws(
      () => buildTool({ description: 'no name' }),
      /Invalid tool definition/
    );
  });
});
