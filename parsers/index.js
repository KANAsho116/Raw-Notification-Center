/**
 * Parser registry - manages all site parsers
 * Add new parsers here when adding support for new sites
 */

// Import parsers (in content script context, these will be loaded separately)
// For service worker, we'll need to define them inline or use importScripts

const parsers = [];

// RawkumaParser will be added when the script loads
// This allows for dynamic parser registration

/**
 * Register a parser
 * @param {Object} parser - Parser class
 */
function registerParser(parser) {
  if (!parsers.includes(parser)) {
    parsers.push(parser);
  }
}

/**
 * Get parser for a URL
 * @param {string} url - The URL to find a parser for
 * @returns {Object|null} Parser class or null
 */
function getParserForUrl(url) {
  for (const parser of parsers) {
    if (parser.canHandle(url)) {
      return parser;
    }
  }
  return null;
}

/**
 * Get parser by site ID
 * @param {string} siteId - The site ID
 * @returns {Object|null} Parser class or null
 */
function getParserById(siteId) {
  for (const parser of parsers) {
    if (parser.siteId === siteId) {
      return parser;
    }
  }
  return null;
}

/**
 * Get all registered parsers
 * @returns {Array} Array of parser classes
 */
function getAllParsers() {
  return [...parsers];
}

// Register RawkumaParser if it exists
if (typeof RawkumaParser !== 'undefined') {
  registerParser(RawkumaParser);
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registerParser,
    getParserForUrl,
    getParserById,
    getAllParsers
  };
}
