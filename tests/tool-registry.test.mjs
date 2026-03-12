import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRegistry } from '../lib/tool-registry.mjs';

describe('tool-registry', () => {
  let tempDir;
  let registry;
  let sampleToolPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forge-test-'));
    registry = createRegistry(tempDir);
    sampleToolPath = join(tempDir, 'sample-tool.yaml');
    writeFileSync(sampleToolPath, 'name: sample-tool\ndescription: A sample tool\nversion: "1.0.0"\nhandler: echo hello\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createRegistry', () => {
    it('should create a registry with expected methods', () => {
      assert.ok(typeof registry.install === 'function');
      assert.ok(typeof registry.uninstall === 'function');
      assert.ok(typeof registry.list === 'function');
      assert.ok(typeof registry.get === 'function');
      assert.ok(typeof registry.has === 'function');
      assert.ok(typeof registry.search === 'function');
    });

    it('should start with empty tool list', () => {
      assert.deepStrictEqual(registry.list(), []);
    });
  });

  describe('install', () => {
    it('should install a tool', () => {
      const result = registry.install(sampleToolPath, {
        name: 'sample-tool',
        version: '1.0.0',
        author: 'test',
      });
      assert.strictEqual(result.name, 'sample-tool');
      assert.strictEqual(result.version, '1.0.0');
      assert.ok(result.installedAt);
    });

    it('should throw for missing file', () => {
      assert.throws(() => registry.install('/nonexistent.yaml'), /not found/i);
    });
  });

  describe('list and get', () => {
    it('should list installed tools', () => {
      registry.install(sampleToolPath, { name: 'tool-a' });
      const tools = registry.list();
      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0].name, 'tool-a');
    });

    it('should get a specific tool', () => {
      registry.install(sampleToolPath, { name: 'tool-b' });
      const tool = registry.get('tool-b');
      assert.ok(tool);
      assert.strictEqual(tool.name, 'tool-b');
    });

    it('should return null for unknown tool', () => {
      assert.strictEqual(registry.get('unknown'), null);
    });
  });

  describe('has', () => {
    it('should check if tool exists', () => {
      assert.strictEqual(registry.has('sample'), false);
      registry.install(sampleToolPath, { name: 'sample' });
      assert.strictEqual(registry.has('sample'), true);
    });
  });

  describe('uninstall', () => {
    it('should uninstall a tool', () => {
      registry.install(sampleToolPath, { name: 'removable' });
      assert.strictEqual(registry.has('removable'), true);
      const removed = registry.uninstall('removable');
      assert.strictEqual(removed, true);
      assert.strictEqual(registry.has('removable'), false);
    });

    it('should return false for unknown tool', () => {
      assert.strictEqual(registry.uninstall('nonexistent'), false);
    });
  });

  describe('search', () => {
    it('should search by name', () => {
      registry.install(sampleToolPath, { name: 'db-query', tags: ['database'] });
      const results = registry.search('db');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, 'db-query');
    });

    it('should search by tag', () => {
      registry.install(sampleToolPath, { name: 'my-tool', tags: ['messaging'] });
      const results = registry.search('messag');
      assert.strictEqual(results.length, 1);
    });

    it('should return empty for no matches', () => {
      const results = registry.search('zzzzz');
      assert.strictEqual(results.length, 0);
    });
  });

  describe('getToolPaths', () => {
    it('should return paths of installed tools', () => {
      registry.install(sampleToolPath, { name: 'pathed' });
      const paths = registry.getToolPaths();
      assert.strictEqual(paths.length, 1);
      assert.ok(paths[0].endsWith('.yaml'));
    });
  });

  describe('clear', () => {
    it('should clear all tools', () => {
      registry.install(sampleToolPath, { name: 'clearable' });
      assert.strictEqual(registry.list().length, 1);
      registry.clear();
      assert.strictEqual(registry.list().length, 0);
    });
  });
});
