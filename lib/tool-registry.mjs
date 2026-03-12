/**
 * FORGE Tool Registry
 * Manage installed custom tools: install, uninstall, list, update.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, renameSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import semver from 'semver';

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
    if (!existsSync(registryPath)) {
      // Create default registry
      const defaultRegistry = { tools: {}, version: 1 };
      saveRegistry(defaultRegistry);
      return defaultRegistry;
    }

    try {
      const content = readFileSync(registryPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to load registry from ${registryPath}: ${err.message}`);
    }
  }

  function saveRegistry(data) {
    ensureDirs();

    try {
      // Atomic write: write to temp file, then rename
      const tempPath = registryPath + '.tmp';
      writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');

      // Rename is atomic on most filesystems
      renameSync(tempPath, registryPath);
    } catch (err) {
      throw new Error(`Failed to save registry to ${registryPath}: ${err.message}`);
    }
  }

  /**
   * Install a tool from a YAML/JSON definition file.
   * Supports version tracking and dependency resolution.
   * @param {string} filePath - Path to tool definition
   * @param {Object} [meta] - Additional metadata (author, tags, version, dependencies, etc.)
   * @returns {Object} Installed tool info
   */
  function install(filePath, meta = {}) {
    const backup = { registry: null, toolName: null };

    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('File path must be a non-empty string');
      }

      const absPath = resolve(filePath);
      if (!existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
      }

      const registry = loadRegistry();

      const fileName = basename(absPath);
      const destPath = join(toolsDir, fileName);

      // Check for file conflicts
      for (const [existingName, existingTool] of Object.entries(registry.tools)) {
        if (existingTool.file === fileName) {
          const proposedName = meta.name || fileName.replace(/\.(yaml|yml|json)$/, '');
          if (existingName !== proposedName) {
            throw new Error(
              `File name conflict: "${fileName}" is already used by tool "${existingName}". ` +
              `Rename the file or uninstall the existing tool first.`
            );
          }
        }
      }

      const toolName = meta.name || fileName.replace(/\.(yaml|yml|json)$/, '');

      // Validate version format
      const toolVersion = meta.version || '1.0.0';
      if (!semver.valid(toolVersion)) {
        throw new Error(`Invalid version format: ${toolVersion}. Must be valid semver (e.g., 1.0.0)`);
      }

      // Check if tool with this name already exists (version upgrade/downgrade)
      const existingTool = registry.tools[toolName];
      if (existingTool) {
        // Back up existing tool for rollback
        backup.registry = JSON.parse(JSON.stringify(registry));
        backup.toolName = toolName;

        // Compare versions
        if (semver.valid(existingTool.version)) {
          if (semver.gt(existingTool.version, toolVersion)) {
            console.warn(`Warning: Downgrading "${toolName}" from ${existingTool.version} to ${toolVersion}`);
          } else if (semver.lt(existingTool.version, toolVersion)) {
            console.error(`[Registry] Upgrading "${toolName}" from ${existingTool.version} to ${toolVersion}`);
          }
        }
      }

      // Validate and resolve dependencies
      const dependencies = meta.dependencies || {};
      if (typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        throw new Error('dependencies must be an object mapping tool names to version ranges');
      }

      // Check that all dependencies are installed with compatible versions
      for (const [depName, versionRange] of Object.entries(dependencies)) {
        if (!registry.tools[depName]) {
          throw new Error(
            `Missing dependency: "${depName}" is required but not installed. ` +
            `Install it first with version ${versionRange}.`
          );
        }

        const depVersion = registry.tools[depName].version;
        if (semver.valid(depVersion) && !semver.satisfies(depVersion, versionRange)) {
          throw new Error(
            `Dependency version mismatch: "${depName}" version ${depVersion} does not satisfy ${versionRange}`
          );
        }
      }

      // Copy file to registry
      copyFileSync(absPath, destPath);

      // Update registry
      registry.tools[toolName] = {
        name: toolName,
        file: fileName,
        path: destPath,
        source: absPath,
        installedAt: existingTool?.installedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: toolVersion,
        author: meta.author || 'unknown',
        tags: meta.tags || [],
        dependencies: dependencies,
        dependents: existingTool?.dependents || [], // Tools that depend on this one
        ...meta,
      };

      // Update dependent tools tracking
      for (const depName of Object.keys(dependencies)) {
        if (registry.tools[depName]) {
          if (!registry.tools[depName].dependents) {
            registry.tools[depName].dependents = [];
          }
          if (!registry.tools[depName].dependents.includes(toolName)) {
            registry.tools[depName].dependents.push(toolName);
          }
        }
      }

      saveRegistry(registry);
      return registry.tools[toolName];
    } catch (err) {
      // Rollback on failure
      if (backup.registry && backup.toolName) {
        console.error(`[Registry] Installation failed, rolling back "${backup.toolName}"`);
        try {
          saveRegistry(backup.registry);
        } catch (rollbackErr) {
          console.error(`[Registry] Rollback failed: ${rollbackErr.message}`);
        }
      }
      throw new Error(`Failed to install tool: ${err.message}`);
    }
  }

  /**
   * Uninstall a tool by name.
   * Checks for dependents before removal.
   * @param {string} toolName
   * @param {Object} [options] - Options for uninstall
   * @param {boolean} [options.force] - Force uninstall even if other tools depend on it
   * @returns {boolean} True if removed
   */
  function uninstall(toolName, options = {}) {
    try {
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Tool name must be a non-empty string');
      }

      const registry = loadRegistry();
      const tool = registry.tools[toolName];
      if (!tool) return false;

      // Check if other tools depend on this one
      const dependents = tool.dependents || [];
      if (dependents.length > 0 && !options.force) {
        throw new Error(
          `Cannot uninstall "${toolName}": it is required by ${dependents.join(', ')}. ` +
          `Use { force: true } to uninstall anyway.`
        );
      }

      // Remove from file system
      const toolPath = join(toolsDir, tool.file);
      if (existsSync(toolPath)) {
        rmSync(toolPath);
      }

      // Remove from dependents lists of dependencies
      for (const depName of Object.keys(tool.dependencies || {})) {
        if (registry.tools[depName]?.dependents) {
          registry.tools[depName].dependents = registry.tools[depName].dependents.filter(
            d => d !== toolName
          );
        }
      }

      // Remove from registry
      delete registry.tools[toolName];
      saveRegistry(registry);
      return true;
    } catch (err) {
      throw new Error(`Failed to uninstall tool "${toolName}": ${err.message}`);
    }
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
    try {
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Tool name must be a non-empty string');
      }

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
    } catch (err) {
      throw new Error(`Failed to update tool "${toolName}": ${err.message}`);
    }
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

  /**
   * Get version information for a tool.
   * @param {string} toolName
   * @returns {Object|null} Version info or null if not found
   */
  function getVersion(toolName) {
    const tool = get(toolName);
    if (!tool) return null;

    return {
      name: toolName,
      version: tool.version,
      installedAt: tool.installedAt,
      updatedAt: tool.updatedAt,
      dependencies: tool.dependencies || {},
      dependents: tool.dependents || [],
    };
  }

  /**
   * Check if a tool satisfies a version range.
   * @param {string} toolName
   * @param {string} versionRange - Semver range (e.g., "^1.0.0", ">=2.0.0")
   * @returns {boolean}
   */
  function satisfiesVersion(toolName, versionRange) {
    const tool = get(toolName);
    if (!tool || !tool.version) return false;

    try {
      return semver.satisfies(tool.version, versionRange);
    } catch (err) {
      return false;
    }
  }

  /**
   * Get dependency tree for a tool (recursive).
   * @param {string} toolName
   * @param {Set} [visited] - For cycle detection
   * @returns {Object} Dependency tree
   */
  function getDependencyTree(toolName, visited = new Set()) {
    if (visited.has(toolName)) {
      return { name: toolName, circular: true };
    }

    const tool = get(toolName);
    if (!tool) {
      return { name: toolName, missing: true };
    }

    visited.add(toolName);

    const deps = tool.dependencies || {};
    const tree = {
      name: toolName,
      version: tool.version,
      dependencies: {},
    };

    for (const [depName, versionRange] of Object.entries(deps)) {
      tree.dependencies[depName] = {
        required: versionRange,
        ...getDependencyTree(depName, new Set(visited)),
      };
    }

    return tree;
  }

  /**
   * Validate all dependencies are satisfied across the registry.
   * @returns {Array<string>} Array of error messages, empty if all valid
   */
  function validateDependencies() {
    const errors = [];
    const registry = loadRegistry();

    for (const [toolName, tool] of Object.entries(registry.tools)) {
      const deps = tool.dependencies || {};

      for (const [depName, versionRange] of Object.entries(deps)) {
        if (!registry.tools[depName]) {
          errors.push(`Tool "${toolName}" depends on "${depName}" which is not installed`);
        } else {
          const depVersion = registry.tools[depName].version;
          if (semver.valid(depVersion) && !semver.satisfies(depVersion, versionRange)) {
            errors.push(
              `Tool "${toolName}" requires "${depName}" ${versionRange}, but ${depVersion} is installed`
            );
          }
        }
      }
    }

    return errors;
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
    getVersion,
    satisfiesVersion,
    getDependencyTree,
    validateDependencies,
    registryDir,
    toolsDir,
  };
}

export default { createRegistry };
