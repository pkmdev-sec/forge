/**
 * FORGE Tool Registry
 * Manage installed custom tools: install, uninstall, list, update.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

const DEFAULT_REGISTRY_DIR = resolve(process.env.HOME || '~', '.forge');
const REGISTRY_FILE = 'registry.json';

/**
 * Create a tool registry instance.
 * @param {string} [registryDir] - Directory to store registry data
 * @returns {Object} Registry API
 */
export function createRegistry(registryDir = DEFAULT_REGISTRY_DIR) {
  const registryPath = join(registryDir, REGISTRY_FILE);
  const toolsDir = join(registryDir, 'tools');

  function ensureDirs() {
    if (!existsSync(registryDir)) mkdirSync(registryDir, { recursive: true });
    if (!existsSync(toolsDir)) mkdirSync(toolsDir, { recursive: true });
  }

  function loadRegistry() {
    ensureDirs();
    if (!existsSync(registryPath)) return { tools: {}, version: 1 };
    return JSON.parse(readFileSync(registryPath, 'utf-8'));
  }

  function saveRegistry(data) {
    ensureDirs();
    writeFileSync(registryPath, JSON.stringify(data, null, 2));
  }

  /**
   * Install a tool from a YAML/JSON definition file.
   * @param {string} filePath - Path to tool definition
   * @param {Object} [meta] - Additional metadata (author, tags, etc.)
   * @returns {Object} Installed tool info
   */
  function install(filePath, meta = {}) {
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    const registry = loadRegistry();

    const fileName = basename(absPath);
    const destPath = join(toolsDir, fileName);
    copyFileSync(absPath, destPath);
    const toolName = meta.name || fileName.replace(/\.(yaml|yml|json)$/, '');

    registry.tools[toolName] = {
      name: toolName,
      file: fileName,
      path: destPath,
      source: absPath,
      installedAt: new Date().toISOString(),
      version: meta.version || '1.0.0',
      author: meta.author || 'unknown',
      tags: meta.tags || [],
      ...meta,
    };

    saveRegistry(registry);
    return registry.tools[toolName];
  }

  /**
   * Uninstall a tool by name.
   * @param {string} toolName
   * @returns {boolean} True if removed
   */
  function uninstall(toolName) {
    const registry = loadRegistry();
    const tool = registry.tools[toolName];
    if (!tool) return false;

    const toolPath = join(toolsDir, tool.file);
    if (existsSync(toolPath)) {
      rmSync(toolPath);
    }

    delete registry.tools[toolName];
    saveRegistry(registry);
    return true;
  }

  /**
   * List all installed tools.
   * @returns {Array<Object>} Array of tool info objects
   */
  function list() {
    const registry = loadRegistry();
    return Object.values(registry.tools);
  }

  /**
   * Get a specific tool by name.
   * @param {string} toolName
   * @returns {Object|null}
   */
  function get(toolName) {
    const registry = loadRegistry();
    return registry.tools[toolName] || null;
  }

  /**
   * Check if a tool is installed.
   * @param {string} toolName
   * @returns {boolean}
   */
  function has(toolName) {
    const registry = loadRegistry();
    return toolName in registry.tools;
  }

  /**
   * Update a tool by reinstalling from its source path.
   * @param {string} toolName
   * @returns {Object} Updated tool info
   */
  function update(toolName) {
    const registry = loadRegistry();
    const tool = registry.tools[toolName];
    if (!tool) throw new Error(`Tool not installed: ${toolName}`);
    if (!existsSync(tool.source)) {
      throw new Error(`Source file no longer exists: ${tool.source}`);
    }

    copyFileSync(tool.source, tool.path);
    tool.updatedAt = new Date().toISOString();
    saveRegistry(registry);
    return tool;
  }

  /**
   * Search installed tools by tag or name pattern.
   * @param {string} query
   * @returns {Array<Object>}
   */
  function search(query) {
    const q = query.toLowerCase();
    return list().filter(tool =>
      tool.name.toLowerCase().includes(q) ||
      (tool.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (tool.description || '').toLowerCase().includes(q)
    );
  }

  /**
   * Get all tool file paths for server loading.
   * @returns {Array<string>}
   */
  function getToolPaths() {
    return list().map(t => t.path).filter(p => existsSync(p));
  }

  /**
   * Clear the entire registry.
   */
  function clear() {
    saveRegistry({ tools: {}, version: 1 });
  }

  return {
    install,
    uninstall,
    list,
    get,
    has,
    update,
    search,
    getToolPaths,
    clear,
    registryDir,
    toolsDir,
  };
}

export default { createRegistry };
