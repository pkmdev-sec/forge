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
   * Search the marketplace catalog with relevance scoring.
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @param {boolean} [options.sortByRelevance] - Sort by relevance score (default: true)
   * @returns {Array<Object>} Matching tools with relevance scores
   */
  function search(query, options = {}) {
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Search query must be a non-empty string');
      }

      const { sortByRelevance = true } = options;
      const catalog = loadCatalog();
      const q = query.toLowerCase().trim();
      const keywords = q.split(/\s+/);

      // Score each tool by relevance
      const results = [];
      for (const tool of catalog.tools) {
        let score = 0;

        // Exact name match: highest score
        if (tool.name.toLowerCase() === q) {
          score += 100;
        } else if (tool.name.toLowerCase().includes(q)) {
          score += 50;
        }

        // Check each keyword
        for (const keyword of keywords) {
          // Name contains keyword
          if (tool.name.toLowerCase().includes(keyword)) {
            score += 20;
          }

          // Description contains keyword
          if (tool.description && tool.description.toLowerCase().includes(keyword)) {
            score += 10;
          }

          // Tag exact match
          if ((tool.tags || []).some(tag => tag.toLowerCase() === keyword)) {
            score += 15;
          }

          // Tag partial match
          if ((tool.tags || []).some(tag => tag.toLowerCase().includes(keyword))) {
            score += 5;
          }
        }

        // Boost by popularity (downloads and ratings)
        score += Math.min((tool.downloads || 0) * 0.1, 20);
        score += (tool.rating || 0) * 2;

        if (score > 0) {
          results.push({ ...tool, relevanceScore: score });
        }
      }

      // Sort by relevance if requested
      if (sortByRelevance) {
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      return results;
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

  /**
   * Get featured/trending tools based on ratings and downloads.
   * @param {number} [limit=10] - Number of tools to return
   * @returns {Array<Object>} Featured tools
   */
  function getFeatured(limit = 10) {
    const catalog = loadCatalog();

    // Score tools by popularity (ratings + downloads)
    const scored = catalog.tools.map(tool => ({
      ...tool,
      popularityScore: (tool.rating || 0) * 10 + Math.log10((tool.downloads || 0) + 1) * 5,
    }));

    // Sort by popularity score
    scored.sort((a, b) => b.popularityScore - a.popularityScore);

    return scored.slice(0, limit);
  }

  /**
   * Get trending tools (recently popular).
   * @param {number} [limit=10] - Number of tools to return
   * @param {number} [daysWindow=30] - Days to consider for trending
   * @returns {Array<Object>} Trending tools
   */
  function getTrending(limit = 10, daysWindow = 30) {
    const catalog = loadCatalog();
    const now = Date.now();
    const windowMs = daysWindow * 24 * 60 * 60 * 1000;

    // Filter tools published/updated within the window
    const recent = catalog.tools.filter(tool => {
      const publishedAt = new Date(tool.publishedAt).getTime();
      return (now - publishedAt) <= windowMs;
    });

    // Score by recency + popularity
    const scored = recent.map(tool => {
      const age = now - new Date(tool.publishedAt).getTime();
      const recencyScore = Math.max(0, 100 - (age / windowMs) * 100);
      const popularityScore = (tool.rating || 0) * 10 + (tool.downloads || 0) * 0.5;

      return {
        ...tool,
        trendingScore: recencyScore + popularityScore,
      };
    });

    scored.sort((a, b) => b.trendingScore - a.trendingScore);

    return scored.slice(0, limit);
  }

  /**
   * Uninstall a tool from the local registry.
   * @param {string} toolName - Name of the tool to uninstall
   * @param {Object} [options] - Uninstall options
   * @returns {boolean} True if uninstalled
   */
  function uninstallFromRegistry(toolName, options = {}) {
    try {
      return registry.uninstall(toolName, options);
    } catch (err) {
      throw new Error(`Failed to uninstall tool from registry: ${err.message}`);
    }
  }

  return {
    publish,
    search,
    browse,
    installFromMarketplace,
    uninstallFromRegistry,
    unpublish,
    stats,
    rate,
    getFeatured,
    getTrending,
    loadCatalog,
    marketplaceDir,
  };
}

export default { createMarketplace };
