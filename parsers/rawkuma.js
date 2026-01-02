/**
 * Parser for rawkuma.net manga site
 */
class RawkumaParser {
  static siteId = 'rawkuma';
  static siteName = 'Rawkuma';
  static urlPattern = /^https?:\/\/rawkuma\.net\/manga\/([^\/]+)\/?$/;

  /**
   * Check if this parser can handle the given URL
   * @param {string} url - The URL to check
   * @returns {boolean}
   */
  static canHandle(url) {
    return this.urlPattern.test(url);
  }

  /**
   * Extract the manga slug from URL
   * @param {string} url - The manga page URL
   * @returns {string|null}
   */
  static extractSlug(url) {
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
   * Extract chapter number from chapter string
   * @param {string} chapterStr - Chapter string like "Chapter 80"
   * @returns {number}
   */
  static extractChapterNumber(chapterStr) {
    if (!chapterStr) return 0;
    const match = chapterStr.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Parse manga info from HTML document
   * @param {Document} doc - The parsed HTML document
   * @param {string} url - The original URL
   * @returns {Object} Manga info object
   */
  static parseMangaInfo(doc, url) {
    const slug = this.extractSlug(url);

    // Title - from h4 heading in article
    const titleEl = doc.querySelector('article h4');
    const title = titleEl?.textContent?.trim() || 'Unknown';

    // Thumbnail - main manga image
    const thumbnailEl = doc.querySelector('article img[alt]');
    const thumbnail = thumbnailEl?.src || '';

    // Find chapters tab panel - look for links that contain chapter info
    const chapterLinks = doc.querySelectorAll('a[href*="/chapter-"]');
    let latestChapter = '';
    let latestChapterNum = 0;
    let latestChapterUrl = '';

    if (chapterLinks.length > 0) {
      // First chapter link should be the latest
      const firstChapterLink = chapterLinks[0];
      latestChapterUrl = firstChapterLink.href;

      // Find chapter text within the link
      const chapterTextEl = firstChapterLink.querySelector('span, div');
      if (chapterTextEl) {
        latestChapter = chapterTextEl.textContent.trim();
      } else {
        // Try to get text content directly
        const textNodes = Array.from(firstChapterLink.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE || n.nodeName !== 'IMG')
          .map(n => n.textContent?.trim())
          .filter(t => t && t.includes('Chapter'));
        latestChapter = textNodes[0] || '';
      }

      // Also try looking for chapter number in nearby elements
      if (!latestChapter) {
        const parent = firstChapterLink.parentElement;
        const spans = parent?.querySelectorAll('span, div');
        for (const span of spans || []) {
          const text = span.textContent?.trim();
          if (text && text.match(/Chapter\s+\d/i)) {
            latestChapter = text;
            break;
          }
        }
      }

      latestChapterNum = this.extractChapterNumber(latestChapter);
    }

    // Last updated - look for "Last Updates" heading and get next sibling text
    let lastUpdated = '';
    const allElements = doc.querySelectorAll('*');
    for (const el of allElements) {
      if (el.textContent?.trim() === 'Last Updates') {
        const nextEl = el.nextElementSibling;
        if (nextEl) {
          lastUpdated = nextEl.textContent?.trim() || '';
          break;
        }
      }
    }

    // Alternative: look for time-related text near chapter links
    if (!lastUpdated && chapterLinks.length > 0) {
      const firstLink = chapterLinks[0];
      const parent = firstLink.closest('div, li, article');
      if (parent) {
        const timeEl = parent.querySelector('[class*="time"], [class*="date"], [class*="ago"]');
        if (timeEl) {
          lastUpdated = timeEl.textContent?.trim() || '';
        } else {
          // Look for text containing "ago"
          const textContent = parent.textContent;
          const agoMatch = textContent.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i);
          if (agoMatch) {
            lastUpdated = agoMatch[1];
          }
        }
      }
    }

    return {
      site: this.siteId,
      slug,
      url,
      title,
      thumbnail,
      latestChapter,
      latestChapterNum,
      latestChapterUrl,
      lastUpdated,
      lastChecked: Date.now(),
      isRead: true,
      notifyEnabled: true,
      addedAt: Date.now()
    };
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
   * Get button insert target for content script
   * @param {Document} doc - The document
   * @returns {Element|null}
   */
  static getButtonInsertTarget(doc) {
    // Look for Bookmark button
    const bookmarkBtn = doc.querySelector('button[type="button"]');
    if (bookmarkBtn) {
      const parent = bookmarkBtn.parentElement;
      // Look for button containing "Bookmark" text
      const buttons = parent?.querySelectorAll('button');
      for (const btn of buttons || []) {
        if (btn.textContent?.includes('Bookmark')) {
          return btn;
        }
      }
    }
    return null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RawkumaParser };
}
