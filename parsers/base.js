/**
 * Base class for site-specific manga parsers
 * Extend this class to add support for new manga sites
 */
class BaseSiteParser {
  static siteId = '';
  static siteName = '';
  static urlPattern = null;

  /**
   * Check if this parser can handle the given URL
   * @param {string} url - The URL to check
   * @returns {boolean}
   */
  static canHandle(url) {
    if (!this.urlPattern) return false;
    return this.urlPattern.test(url);
  }

  /**
   * Extract the manga slug from URL
   * @param {string} url - The manga page URL
   * @returns {string|null}
   */
  static extractSlug(url) {
    if (!this.urlPattern) return null;
    const match = url.match(this.urlPattern);
    return match ? match[1] : null;
  }

  /**
   * Generate a unique ID for a manga
   * @param {string} slug - The manga slug
   * @returns {string}
   */
  static generateId(slug) {
    return `${this.siteId}:${slug}`;
  }

  /**
   * Parse manga info from HTML document
   * @param {Document} doc - The parsed HTML document
   * @param {string} url - The original URL
   * @returns {Object} Manga info object
   */
  static parseMangaInfo(doc, url) {
    throw new Error('parseMangaInfo must be implemented by subclass');
  }

  /**
   * Fetch and parse manga info from URL
   * @param {string} url - The manga page URL
   * @returns {Promise<Object>} Manga info object
   */
  static async fetchMangaInfo(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return this.parseMangaInfo(doc, url);
  }

  /**
   * Extract chapter number from chapter string
   * @param {string} chapterStr - Chapter string like "Chapter 80"
   * @returns {number}
   */
  static extractChapterNumber(chapterStr) {
    if (!chapterStr) return 0;
    const match = chapterStr.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BaseSiteParser };
}
