/**
 * FORGE Marketplace
 * Share and discover tools via a local or remote marketplace.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRegistry } from './tool-registry.mjs';

const DEFAULT_MARKETPLACE_DIR = resolve(process.env.HOME || '~', '.forge', 'marketplace');
const CATALOG_FILE = 'catalog.json';

/**
 * Create a marketplace instance.
 * @param {Object} [options]
 * @param {string} [options.marketplaceDir] - Local marketplace directory
 * @param {string} [options.remoteUrl] - Remote marketplace API URL
 * @param {string} [options.registryDir] - Tool registry directory
 * @returns {Object} Marketplace API
 */
export function createMarketplace(options = {}) {
  const {
    marketplaceDir = DEFAULT_MARKETPLACE_DIR,
    remoteUrl = null,
    registryDir = undefined,
  } = options;

  const catalogPath = join(marketplaceDir, CATALOG_FILE);
  const registry = createRegistry(registryDir);

  function ensureDirs() {
    if (!existsSync(marketplaceDir)) mkdirSync(marketplaceDir, { recursive: true });
  }

  function loadCatalog() {
    ensureDirs();
    if (!existsSync(catalogPath)) {
      // Create default catalog
      const defaultCatalog = { tools: [], updatedAt: null, version: 1 };
      saveCatalog(defaultCatalog);
      return defaultCatalog;
    }

    try {
      const content = readFileSync(catalogPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to load marketplace catalog from ${catalogPath}: ${err.message}`);
    }
  }

  function saveCatalog(catalog) {
    ensureDirs();
    try {
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`Failed to save marketplace catalog to ${catalogPath}: ${err.message}`);
    }
  }

  /**
   * Publish a tool to the local marketplace.
   * @param {Object} toolMeta - Tool metadata
   * @param {string} toolMeta.name - Tool name
   * @param {string} toolMeta.description - Tool description
   * @param {string} toolMeta.version - Tool version
   * @param {string} toolMeta.author - Author name
   * @param {string} toolMeta.file - Path to tool definition file
   * @param {string[]} [toolMeta.tags] - Tags for discovery
   * @returns {Object} Published entry
   */
  function publish(toolMeta) {
    try {
      if (!toolMeta || typeof toolMeta !== 'object') {
        throw new Error('Tool metadata must be an object');
      }
      if (!toolMeta.name) throw new Error('Tool name is required');
      if (!toolMeta.file) throw new Error('Tool file path is required');
      if (!existsSync(resolve(toolMeta.file))) {
        throw new Error(`Tool file not found: ${toolMeta.file}`);
      }

      const catalog = loadCatalog();

      const entry = {
        name: toolMeta.name,
        description: toolMeta.description || '',
        version: toolMeta.version || '1.0.0',
        author: toolMeta.author || 'anonymous',
        tags: toolMeta.tags || [],
        file: resolve(toolMeta.file),
        publishedAt: new Date().toISOString(),
        downloads: 0,
        rating: 0,
        ratingCount: 0,
        ratingSum: 0,
      };

      // Update existing or add new
      const idx = catalog.tools.findIndex(t => t.name === entry.name);
      if (idx >= 0) {
        entry.downloads = catalog.tools[idx].downloads;
        entry.rating = catalog.tools[idx].rating;
        entry.ratingCount = catalog.tools[idx].ratingCount || 0;
        entry.ratingSum = catalog.tools[idx].ratingSum || 0;
        catalog.tools[idx] = entry;
      } else {
        catalog.tools.push(entry);
      }

      catalog.updatedAt = new Date().toISOString();
      saveCatalog(catalog);
      return entry;
    } catch (err) {
      throw new Error(`Failed to publish tool: ${err.message}`);
    }
  }

  /**
   * Search the marketplace catalog.
   * @param {string} query - Search query
   * @returns {Array<Object>} Matching tools
   */
  function search(query) {
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Search query must be a non-empty string');
      }

      const catalog = loadCatalog();
      const q = query.toLowerCase();
      return catalog.tools.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    } catch (err) {
      throw new Error(`Failed to search marketplace: ${err.message}`);
    }
  }

  /**
   * Browse all available tools, optionally sorted.
   * @param {Object} [options]
   * @param {string} [options.sortBy] - Sort field: 'name', 'downloads', 'rating', 'publishedAt'
   * @param {number} [options.limit] - Max results
   * @returns {Array<Object>}
   */
  function browse(options = {}) {
    const catalog = loadCatalog();
    let results = [...catalog.tools];

    if (options.sortBy) {
      results.sort((a, b) => {
        if (typeof a[options.sortBy] === 'number') return b[options.sortBy] - a[options.sortBy];
        return String(a[options.sortBy]).localeCompare(String(b[options.sortBy]));
      });
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Install a tool from the marketplace into the local registry.
   * @param {string} toolName - Name of the tool to install
   * @returns {Object} Installed tool info
   */
  function installFromMarketplace(toolName) {
    try {
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Tool name must be a non-empty string');
      }

      const catalog = loadCatalog();
      const entry = catalog.tools.find(t => t.name === toolName);
      if (!entry) throw new Error(`Tool not found in marketplace: ${toolName}`);
      if (!existsSync(entry.file)) {
        throw new Error(`Tool file no longer available: ${entry.file}`);
      }

      // Increment download count
      entry.downloads = (entry.downloads || 0) + 1;
      catalog.updatedAt = new Date().toISOString();
      saveCatalog(catalog);

      return registry.install(entry.file, {
        name: entry.name,
        version: entry.version,
        author: entry.author,
        tags: entry.tags,
        description: entry.description,
        source: 'marketplace',
      });
    } catch (err) {
      throw new Error(`Failed to install tool from marketplace: ${err.message}`);
    }
  }

  /**
   * Remove a tool from the marketplace catalog.
   * @param {string} toolName
   * @returns {boolean}
   */
  function unpublish(toolName) {
    const catalog = loadCatalog();
    const idx = catalog.tools.findIndex(t => t.name === toolName);
    if (idx < 0) return false;
    catalog.tools.splice(idx, 1);
    catalog.updatedAt = new Date().toISOString();
    saveCatalog(catalog);
    return true;
  }

  /**
   * Get marketplace stats.
   * @returns {Object}
   */
  function stats() {
    const catalog = loadCatalog();
    return {
      totalTools: catalog.tools.length,
      totalDownloads: catalog.tools.reduce((s, t) => s + (t.downloads || 0), 0),
      lastUpdated: catalog.updatedAt,
      authors: [...new Set(catalog.tools.map(t => t.author))],
    };
  }

  /**
   * Rate a tool.
   * @param {string} toolName
   * @param {number} rating - 1-5
   */
  function rate(toolName, rating) {
    try {
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Tool name must be a non-empty string');
      }
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        throw new Error('Rating must be a number between 1 and 5');
      }

      const catalog = loadCatalog();
      const entry = catalog.tools.find(t => t.name === toolName);
      if (!entry) throw new Error(`Tool not found: ${toolName}`);

      // Initialize rating tracking fields if missing
      if (!entry.ratingCount) entry.ratingCount = 0;
      if (!entry.ratingSum) entry.ratingSum = 0;

      // Add new rating to running average
      entry.ratingCount += 1;
      entry.ratingSum += rating;
      entry.rating = entry.ratingSum / entry.ratingCount;

      catalog.updatedAt = new Date().toISOString();
      saveCatalog(catalog);
      return entry;
    } catch (err) {
      throw new Error(`Failed to rate tool: ${err.message}`);
    }
  }

  return {
    publish,
    search,
    browse,
    installFromMarketplace,
    unpublish,
    stats,
    rate,
    loadCatalog,
    marketplaceDir,
  };
}

export default { createMarketplace };
