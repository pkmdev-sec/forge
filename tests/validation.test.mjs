import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateToolDefinition, buildHandler } from '../lib/tool-builder.mjs';
import { resolveType, generateInputSchema } from '../lib/schema-generator.mjs';
import { createServer } from '../lib/mcp-server.mjs';
import { createRegistry } from '../lib/tool-registry.mjs';
import { createMarketplace } from '../lib/marketplace.mjs';

describe('P1 Feature Validation Tests', () => {
  describe('Shell Injection Prevention', () => {
    it('should prevent shell injection with semicolons', async () => {
      const handler = buildHandler({
        name: 'test-tool',
        handler: 'echo {{input}}',
        handler_type: 'shell',
      });

      const result = await handler({ input: 'hello; rm -rf /' });

      // Semicolons and slashes should be stripped, output should be sanitized
      assert.ok(!result.content[0].text.includes(';'));
      assert.ok(!result.content[0].text.includes('/'));
      // Output should only contain sanitized text (alphanumeric and safe chars)
      const output = result.content[0].text;
      assert.ok(output.includes('hello') || output.includes('rm-rf'));
    });

    it('should prevent shell injection with pipes', async () => {
      const handler = buildHandler({
        name: 'test-tool',
        handler: 'echo {{input}}',
        handler_type: 'shell',
      });

      const result = await handler({ input: 'test | cat /etc/passwd' });

      // Pipes and slashes should be stripped
      assert.ok(!result.content[0].text.includes('|'));
      assert.ok(!result.content[0].text.includes('/'));
      // Output should only contain sanitized text
      const output = result.content[0].text;
      assert.ok(output.includes('test') || output.includes('cat'));
    });

    it('should prevent shell injection with backticks', async () => {
      const handler = buildHandler({
        name: 'test-tool',
        handler: 'echo {{input}}',
        handler_type: 'shell',
      });

      const result = await handler({ input: '`whoami`' });

      // Backticks should be stripped
      assert.ok(!result.content[0].text.includes('`'));
    });

    it('should prevent shell injection with command substitution', async () => {
      const handler = buildHandler({
        name: 'test-tool',
        handler: 'echo {{input}}',
        handler_type: 'shell',
      });

      const result = await handler({ input: '$(whoami)' });

      // Dollar signs and parentheses should be stripped
      assert.ok(!result.content[0].text.includes('$'));
      assert.ok(!result.content[0].text.includes('('));
    });

    it('should handle multiple parameters safely', async () => {
      const handler = buildHandler({
        name: 'multi-param',
        handler: 'echo {{first}} {{second}}',
        handler_type: 'shell',
      });

      const result = await handler({
        first: 'hello; ls',
        second: '| cat /etc/passwd'
      });

      // All dangerous characters should be stripped
      assert.ok(!result.content[0].text.includes(';'));
      assert.ok(!result.content[0].text.includes('|'));
    });
  });

  describe('MCP Tool Type Validation', () => {
    it('should validate standard tool type', () => {
      const result = validateToolDefinition({
        type: 'tool',
        name: 'standard-tool',
        description: 'A standard tool',
        parameters: { input: { type: 'string' } },
      });
      assert.strictEqual(result.valid, true);
    });

    it('should validate resource type with URI', () => {
      const result = validateToolDefinition({
        type: 'resource',
        name: 'my-resource',
        description: 'A resource',
        uri: 'file:///path/to/resource',
      });
      assert.strictEqual(result.valid, true);
    });

    it('should validate resource type with URI template', () => {
      const result = validateToolDefinition({
        type: 'resource',
        name: 'my-resource',
        description: 'A resource',
        uriTemplate: 'file:///{path}',
        mimeType: 'application/json',
      });
      assert.strictEqual(result.valid, true);
    });

    it('should reject resource type without URI or URI template', () => {
      const result = validateToolDefinition({
        type: 'resource',
        name: 'bad-resource',
        description: 'Missing URI',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('uri')));
    });

    it('should validate prompt type', () => {
      const result = validateToolDefinition({
        type: 'prompt',
        name: 'my-prompt',
        description: 'A prompt',
        arguments: {
          query: { type: 'string', description: 'Search query' },
        },
      });
      assert.strictEqual(result.valid, true);
    });

    it('should reject invalid tool type', () => {
      const result = validateToolDefinition({
        type: 'invalid',
        name: 'bad-tool',
        description: 'Bad type',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Invalid tool type')));
    });
  });

  describe('Nested Schema Generation', () => {
    it('should generate nested object schema', () => {
      const schema = generateInputSchema({
        user: {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
            age: { type: 'integer', required: false },
          },
        },
      });

      assert.strictEqual(schema.properties.user.type, 'object');
      assert.ok(schema.properties.user.properties.name);
      assert.ok(schema.properties.user.properties.age);
      assert.deepStrictEqual(schema.properties.user.required, ['name']);
    });

    it('should generate deeply nested object schema', () => {
      const schema = generateInputSchema({
        company: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
              },
            },
          },
        },
      });

      assert.strictEqual(schema.properties.company.type, 'object');
      assert.strictEqual(schema.properties.company.properties.address.type, 'object');
      assert.ok(schema.properties.company.properties.address.properties.street);
    });

    it('should support array with item schema', () => {
      const schema = generateInputSchema({
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      });

      assert.strictEqual(schema.properties.items.type, 'array');
      assert.strictEqual(schema.properties.items.items.type, 'string');
    });

    it('should support array of objects', () => {
      const schema = generateInputSchema({
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      });

      assert.strictEqual(schema.properties.users.type, 'array');
      assert.strictEqual(schema.properties.users.items.type, 'object');
      assert.ok(schema.properties.users.items.properties.name);
    });

    it('should support enum types', () => {
      const schema = generateInputSchema({
        format: {
          type: 'string',
          enum: ['json', 'xml', 'csv'],
        },
      });

      assert.deepStrictEqual(schema.properties.format.enum, ['json', 'xml', 'csv']);
    });

    it('should support oneOf schemas', () => {
      const schema = generateInputSchema({
        value: {
          oneOf: [
            { type: 'string' },
            { type: 'integer' },
          ],
        },
      });

      assert.ok(schema.properties.value.oneOf);
      assert.strictEqual(schema.properties.value.oneOf.length, 2);
    });

    it('should support anyOf schemas', () => {
      const schema = generateInputSchema({
        value: {
          anyOf: [
            { type: 'string' },
            { type: 'number' },
          ],
        },
      });

      assert.ok(schema.properties.value.anyOf);
      assert.strictEqual(schema.properties.value.anyOf.length, 2);
    });

    it('should support nested array syntax', () => {
      const result = resolveType('array<array<string>>');
      assert.strictEqual(result.type, 'array');
      assert.strictEqual(result.items.type, 'array');
      assert.strictEqual(result.items.items.type, 'string');
    });
  });

  describe('Hot-Reload', () => {
    let tempDir;
    let server;
    let toolPath;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-hotreload-'));
      toolPath = join(tempDir, 'test-tool.yaml');
      writeFileSync(toolPath, 'name: test-tool\ndescription: Original\nhandler: echo original\n');
    });

    afterEach(() => {
      if (server?.shutdown) {
        server.shutdown();
      }
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should create server with hot-reload enabled', () => {
      server = createServer({
        tools: [toolPath],
        hotReload: true,
        watchDir: tempDir,
      });

      assert.strictEqual(server.getToolCount(), 1);
      assert.ok(server.reload);
    });

    it('should manually reload a tool', () => {
      server = createServer({
        tools: [toolPath],
        hotReload: true,
        watchDir: tempDir,
      });

      const originalTool = server.getToolList()[0];
      assert.strictEqual(originalTool.description, 'Original');

      // Update the file
      writeFileSync(toolPath, 'name: test-tool\ndescription: Updated\nhandler: echo updated\n');

      // Manually trigger reload
      server.reload(toolPath);

      // Tool should be reloaded
      const updatedTool = server.getToolList()[0];
      assert.strictEqual(updatedTool.description, 'Updated');
    });
  });

  describe('Health Check', () => {
    it('should return health status', () => {
      const server = createServer({
        tools: [
          { name: 'tool1', description: 'Tool 1' },
          { name: 'tool2', description: 'Tool 2' },
        ],
      });

      const health = server.getHealth();
      assert.strictEqual(health.status, 'healthy');
      assert.strictEqual(health.toolCount, 2);
      assert.strictEqual(health.activeCalls, 0);
      assert.strictEqual(health.queuedCalls, 0);
      assert.ok(typeof health.uptime === 'number');
    });

    it('should handle health check request', () => {
      const server = createServer();
      const response = server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'health/check',
      });

      assert.ok(response.result);
      assert.strictEqual(response.result.status, 'healthy');
      assert.ok(typeof response.result.toolCount === 'number');
    });
  });

  describe('Version Management', () => {
    let tempDir;
    let registry;
    let toolPath;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-version-'));
      registry = createRegistry(tempDir);
      toolPath = join(tempDir, 'test-tool.yaml');
      writeFileSync(toolPath, 'name: test-tool\ndescription: A test tool\nversion: "1.0.0"\n');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should track tool version on install', () => {
      const result = registry.install(toolPath, {
        name: 'versioned-tool',
        version: '1.2.3',
      });

      assert.strictEqual(result.version, '1.2.3');
    });

    it('should validate semver format', () => {
      assert.throws(
        () => registry.install(toolPath, { name: 'bad-version', version: 'not-semver' }),
        /Invalid version format/
      );
    });

    it('should get version information', () => {
      registry.install(toolPath, { name: 'tool-v1', version: '1.0.0' });
      const versionInfo = registry.getVersion('tool-v1');

      assert.ok(versionInfo);
      assert.strictEqual(versionInfo.version, '1.0.0');
      assert.ok(versionInfo.installedAt);
    });

    it('should check if version satisfies range', () => {
      registry.install(toolPath, { name: 'tool-v2', version: '2.5.0' });

      assert.strictEqual(registry.satisfiesVersion('tool-v2', '^2.0.0'), true);
      assert.strictEqual(registry.satisfiesVersion('tool-v2', '^3.0.0'), false);
      assert.strictEqual(registry.satisfiesVersion('tool-v2', '>=2.0.0'), true);
    });
  });

  describe('Dependency Management', () => {
    let tempDir;
    let registry;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-deps-'));
      registry = createRegistry(tempDir);
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should install tool with dependencies', () => {
      const depPath = join(tempDir, 'dep.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(depPath, 'name: dep-tool\ndescription: Dependency\n');
      writeFileSync(toolPath, 'name: main-tool\ndescription: Main tool\n');

      // Install dependency first
      registry.install(depPath, { name: 'dep-tool', version: '1.0.0' });

      // Install tool with dependency
      const result = registry.install(toolPath, {
        name: 'main-tool',
        version: '1.0.0',
        dependencies: { 'dep-tool': '^1.0.0' },
      });

      assert.ok(result.dependencies);
      assert.strictEqual(result.dependencies['dep-tool'], '^1.0.0');
    });

    it('should reject install if dependency is missing', () => {
      const toolPath = join(tempDir, 'tool.yaml');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      assert.throws(
        () => registry.install(toolPath, {
          name: 'tool',
          version: '1.0.0',
          dependencies: { 'missing-dep': '^1.0.0' },
        }),
        /Missing dependency/
      );
    });

    it('should reject install if dependency version does not satisfy', () => {
      const depPath = join(tempDir, 'dep.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(depPath, 'name: dep\ndescription: Dep\n');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      registry.install(depPath, { name: 'dep', version: '1.0.0' });

      assert.throws(
        () => registry.install(toolPath, {
          name: 'tool',
          version: '1.0.0',
          dependencies: { 'dep': '^2.0.0' },
        }),
        /version mismatch/
      );
    });

    it('should prevent uninstall of tool with dependents', () => {
      const depPath = join(tempDir, 'dep.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(depPath, 'name: dep\ndescription: Dep\n');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      registry.install(depPath, { name: 'dep', version: '1.0.0' });
      registry.install(toolPath, {
        name: 'tool',
        version: '1.0.0',
        dependencies: { 'dep': '^1.0.0' },
      });

      assert.throws(
        () => registry.uninstall('dep'),
        /required by/
      );
    });

    it('should allow force uninstall of tool with dependents', () => {
      const depPath = join(tempDir, 'dep.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(depPath, 'name: dep\ndescription: Dep\n');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      registry.install(depPath, { name: 'dep', version: '1.0.0' });
      registry.install(toolPath, {
        name: 'tool',
        version: '1.0.0',
        dependencies: { 'dep': '^1.0.0' },
      });

      const result = registry.uninstall('dep', { force: true });
      assert.strictEqual(result, true);
    });

    it('should get dependency tree', () => {
      const dep1Path = join(tempDir, 'dep1.yaml');
      const dep2Path = join(tempDir, 'dep2.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(dep1Path, 'name: dep1\ndescription: Dep 1\n');
      writeFileSync(dep2Path, 'name: dep2\ndescription: Dep 2\n');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      registry.install(dep1Path, { name: 'dep1', version: '1.0.0' });
      registry.install(dep2Path, {
        name: 'dep2',
        version: '1.0.0',
        dependencies: { 'dep1': '^1.0.0' },
      });
      registry.install(toolPath, {
        name: 'tool',
        version: '1.0.0',
        dependencies: { 'dep2': '^1.0.0' },
      });

      const tree = registry.getDependencyTree('tool');
      assert.strictEqual(tree.name, 'tool');
      assert.ok(tree.dependencies['dep2']);
      assert.ok(tree.dependencies['dep2'].dependencies['dep1']);
    });

    it('should validate all dependencies', () => {
      const dep1Path = join(tempDir, 'dep1.yaml');
      const toolPath = join(tempDir, 'tool.yaml');

      writeFileSync(dep1Path, 'name: dep1\ndescription: Dep 1\n');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      registry.install(dep1Path, { name: 'dep1', version: '1.0.0' });
      registry.install(toolPath, {
        name: 'tool',
        version: '1.0.0',
        dependencies: { 'dep1': '^1.0.0' },
      });

      const errors = registry.validateDependencies();
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('Marketplace Search with Relevance', () => {
    let tempDir;
    let mp;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-mp-search-'));
      mp = createMarketplace({
        marketplaceDir: join(tempDir, 'marketplace'),
        registryDir: join(tempDir, 'registry'),
      });

      // Publish some sample tools
      const toolPath = join(tempDir, 'tool.yaml');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      mp.publish({
        name: 'slack-notifier',
        description: 'Send notifications to Slack',
        file: toolPath,
        tags: ['messaging', 'notifications'],
      });

      mp.publish({
        name: 'slack-search',
        description: 'Search Slack messages',
        file: toolPath,
        tags: ['messaging', 'search'],
      });

      mp.publish({
        name: 'jira-tool',
        description: 'Manage JIRA issues',
        file: toolPath,
        tags: ['project-management'],
      });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should search with relevance scoring', () => {
      const results = mp.search('slack');

      assert.ok(results.length >= 2);
      assert.ok(results[0].relevanceScore > 0);

      // First result should be most relevant
      assert.ok(results[0].name.includes('slack'));
    });

    it('should prioritize exact name matches', () => {
      const results = mp.search('slack-notifier');

      assert.strictEqual(results[0].name, 'slack-notifier');
      assert.ok(results[0].relevanceScore > results[1]?.relevanceScore);
    });

    it('should search by tags', () => {
      const results = mp.search('messaging');

      assert.ok(results.length >= 2);
      assert.ok(results.every(r => r.tags.includes('messaging')));
    });

    it('should handle multi-word queries', () => {
      const results = mp.search('slack messages');

      assert.ok(results.length > 0);
      const slackSearch = results.find(r => r.name === 'slack-search');
      assert.ok(slackSearch);
    });
  });

  describe('Rating System', () => {
    let tempDir;
    let mp;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-mp-rating-'));
      mp = createMarketplace({
        marketplaceDir: join(tempDir, 'marketplace'),
        registryDir: join(tempDir, 'registry'),
      });

      const toolPath = join(tempDir, 'tool.yaml');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      mp.publish({ name: 'rated-tool', file: toolPath });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should compute average rating correctly', () => {
      mp.rate('rated-tool', 5);
      mp.rate('rated-tool', 3);
      mp.rate('rated-tool', 4);

      const catalog = mp.loadCatalog();
      const tool = catalog.tools.find(t => t.name === 'rated-tool');

      assert.strictEqual(tool.ratingCount, 3);
      assert.strictEqual(tool.ratingSum, 12);
      assert.strictEqual(tool.rating, 4); // (5 + 3 + 4) / 3 = 4
    });

    it('should handle single rating', () => {
      const result = mp.rate('rated-tool', 5);
      assert.strictEqual(result.rating, 5);
      assert.strictEqual(result.ratingCount, 1);
    });

    it('should update running average', () => {
      mp.rate('rated-tool', 4);
      let catalog = mp.loadCatalog();
      let tool = catalog.tools.find(t => t.name === 'rated-tool');
      assert.strictEqual(tool.rating, 4);

      mp.rate('rated-tool', 2);
      catalog = mp.loadCatalog();
      tool = catalog.tools.find(t => t.name === 'rated-tool');
      assert.strictEqual(tool.rating, 3); // (4 + 2) / 2 = 3
    });
  });

  describe('Featured and Trending Tools', () => {
    let tempDir;
    let mp;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'forge-mp-featured-'));
      mp = createMarketplace({
        marketplaceDir: join(tempDir, 'marketplace'),
        registryDir: join(tempDir, 'registry'),
      });

      const toolPath = join(tempDir, 'tool.yaml');
      writeFileSync(toolPath, 'name: tool\ndescription: Tool\n');

      mp.publish({ name: 'popular-tool', file: toolPath });
      mp.rate('popular-tool', 5);
      mp.rate('popular-tool', 5);
      mp.installFromMarketplace('popular-tool');
      mp.installFromMarketplace('popular-tool');

      mp.publish({ name: 'unpopular-tool', file: toolPath });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should get featured tools', () => {
      const featured = mp.getFeatured(5);

      assert.ok(featured.length > 0);
      assert.ok(featured[0].popularityScore);

      // Popular tool should rank higher
      const popularIndex = featured.findIndex(t => t.name === 'popular-tool');
      const unpopularIndex = featured.findIndex(t => t.name === 'unpopular-tool');
      assert.ok(popularIndex < unpopularIndex);
    });

    it('should get trending tools', () => {
      const trending = mp.getTrending(5);

      assert.ok(Array.isArray(trending));
      // All tools should be recent (within window)
      assert.ok(trending.every(t => t.trendingScore !== undefined));
    });
  });
});
