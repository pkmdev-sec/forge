import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMarketplace } from '../lib/marketplace.mjs';

describe('marketplace', () => {
  let tempDir;
  let mp;
  let sampleToolPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forge-mp-test-'));
    mp = createMarketplace({
      marketplaceDir: join(tempDir, 'marketplace'),
      registryDir: join(tempDir, 'registry'),
    });
    sampleToolPath = join(tempDir, 'test-tool.yaml');
    writeFileSync(sampleToolPath, 'name: test-tool\ndescription: A test tool\nversion: "1.0.0"\nhandler: echo test\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('publish', () => {
    it('should publish a tool', () => {
      const entry = mp.publish({
        name: 'my-tool',
        description: 'My awesome tool',
        version: '1.0.0',
        author: 'tester',
        file: sampleToolPath,
        tags: ['test'],
      });

      assert.strictEqual(entry.name, 'my-tool');
      assert.strictEqual(entry.version, '1.0.0');
      assert.strictEqual(entry.author, 'tester');
      assert.ok(entry.publishedAt);
    });

    it('should update existing tool on re-publish', () => {
      mp.publish({ name: 'my-tool', file: sampleToolPath, version: '1.0.0' });
      const updated = mp.publish({ name: 'my-tool', file: sampleToolPath, version: '2.0.0' });
      assert.strictEqual(updated.version, '2.0.0');

      const catalog = mp.loadCatalog();
      assert.strictEqual(catalog.tools.length, 1);
    });

    it('should throw for missing name', () => {
      assert.throws(() => mp.publish({ file: sampleToolPath }), /name is required/);
    });

    it('should throw for missing file', () => {
      assert.throws(() => mp.publish({ name: 'x' }), /file path is required/);
    });

    it('should throw for nonexistent file', () => {
      assert.throws(
        () => mp.publish({ name: 'x', file: '/nonexistent.yaml' }),
        /not found/
      );
    });
  });

  describe('search', () => {
    it('should find tools by name', () => {
      mp.publish({ name: 'slack-notifier', file: sampleToolPath, description: 'Send slack messages' });
      mp.publish({ name: 'jira-search', file: sampleToolPath, description: 'Search jira' });

      const results = mp.search('slack');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, 'slack-notifier');
    });

    it('should find tools by description', () => {
      mp.publish({ name: 'tool-x', file: sampleToolPath, description: 'database query executor' });
      const results = mp.search('database');
      assert.strictEqual(results.length, 1);
    });

    it('should find tools by tag', () => {
      mp.publish({ name: 'tagged', file: sampleToolPath, tags: ['monitoring'] });
      const results = mp.search('monitor');
      assert.strictEqual(results.length, 1);
    });

    it('should return empty for no matches', () => {
      const results = mp.search('zzzzz');
      assert.strictEqual(results.length, 0);
    });
  });

  describe('browse', () => {
    it('should return all tools', () => {
      mp.publish({ name: 'tool-a', file: sampleToolPath });
      mp.publish({ name: 'tool-b', file: sampleToolPath });
      const results = mp.browse();
      assert.strictEqual(results.length, 2);
    });

    it('should sort by name', () => {
      mp.publish({ name: 'zebra', file: sampleToolPath });
      mp.publish({ name: 'alpha', file: sampleToolPath });
      const results = mp.browse({ sortBy: 'name' });
      assert.strictEqual(results[0].name, 'alpha');
    });

    it('should limit results', () => {
      mp.publish({ name: 'a', file: sampleToolPath });
      mp.publish({ name: 'b', file: sampleToolPath });
      mp.publish({ name: 'c', file: sampleToolPath });
      const results = mp.browse({ limit: 2 });
      assert.strictEqual(results.length, 2);
    });
  });

  describe('installFromMarketplace', () => {
    it('should install a published tool', () => {
      mp.publish({ name: 'installable', file: sampleToolPath, version: '1.0.0' });
      const installed = mp.installFromMarketplace('installable');
      assert.strictEqual(installed.name, 'installable');
    });

    it('should increment download count', () => {
      mp.publish({ name: 'popular', file: sampleToolPath });
      mp.installFromMarketplace('popular');
      mp.installFromMarketplace('popular');
      const catalog = mp.loadCatalog();
      const tool = catalog.tools.find(t => t.name === 'popular');
      assert.strictEqual(tool.downloads, 2);
    });

    it('should throw for unknown tool', () => {
      assert.throws(() => mp.installFromMarketplace('missing'), /not found in marketplace/);
    });
  });

  describe('unpublish', () => {
    it('should remove a published tool', () => {
      mp.publish({ name: 'removable', file: sampleToolPath });
      assert.strictEqual(mp.unpublish('removable'), true);
      assert.strictEqual(mp.search('removable').length, 0);
    });

    it('should return false for unknown tool', () => {
      assert.strictEqual(mp.unpublish('nonexistent'), false);
    });
  });

  describe('stats', () => {
    it('should return marketplace statistics', () => {
      mp.publish({ name: 'tool-1', file: sampleToolPath, author: 'alice' });
      mp.publish({ name: 'tool-2', file: sampleToolPath, author: 'bob' });
      mp.installFromMarketplace('tool-1');

      const s = mp.stats();
      assert.strictEqual(s.totalTools, 2);
      assert.strictEqual(s.totalDownloads, 1);
      assert.ok(s.authors.includes('alice'));
      assert.ok(s.authors.includes('bob'));
    });
  });

  describe('rate', () => {
    it('should rate a tool', () => {
      mp.publish({ name: 'ratable', file: sampleToolPath });
      const result = mp.rate('ratable', 4);
      assert.strictEqual(result.rating, 4);
    });

    it('should reject invalid ratings', () => {
      mp.publish({ name: 'ratable', file: sampleToolPath });
      assert.throws(() => mp.rate('ratable', 0), /between 1 and 5/);
      assert.throws(() => mp.rate('ratable', 6), /between 1 and 5/);
    });

    it('should throw for unknown tool', () => {
      assert.throws(() => mp.rate('missing', 3), /not found/);
    });
  });
});
