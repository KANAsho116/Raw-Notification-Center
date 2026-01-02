/**
 * Content script for manga update checker
 * Injects "Register" button on manga pages
 */

(function() {
  'use strict';

  // Only run on manga detail pages (not chapter pages)
  const mangaUrlPattern = /^https?:\/\/rawkuma\.net\/manga\/([^\/]+)\/?$/;

  if (!mangaUrlPattern.test(window.location.href)) {
    return;
  }

  const slug = window.location.href.match(mangaUrlPattern)?.[1];
  if (!slug) return;

  const SITE_ID = 'rawkuma';
  const MANGA_ID = `${SITE_ID}:${slug}`;

  let isRegistered = false;
  let button = null;

  /**
   * Extract manga info from the current page
   */
  function extractMangaInfo() {
    // Title
    const titleEl = document.querySelector('article h4');
    const title = titleEl?.textContent?.trim() || 'Unknown';

    // Thumbnail
    const thumbnailEl = document.querySelector('article img[alt]');
    const thumbnail = thumbnailEl?.src || '';

    // Latest chapter
    const chapterLinks = document.querySelectorAll('a[href*="/chapter-"]');
    let latestChapter = '';
    let latestChapterNum = 0;
    let latestChapterUrl = '';

    if (chapterLinks.length > 0) {
      const firstChapterLink = chapterLinks[0];
      latestChapterUrl = firstChapterLink.href;

      // Find chapter text
      const spans = firstChapterLink.querySelectorAll('span, div');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && text.match(/Chapter\s+\d/i)) {
          latestChapter = text;
          break;
        }
      }

      // Extract number
      if (latestChapter) {
        const match = latestChapter.match(/(\d+(?:\.\d+)?)/);
        latestChapterNum = match ? parseFloat(match[1]) : 0;
      }
    }

    // Last updated
    let lastUpdated = '';
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.textContent?.trim() === 'Last Updates') {
        const nextEl = el.nextElementSibling;
        if (nextEl) {
          lastUpdated = nextEl.textContent?.trim() || '';
          break;
        }
      }
    }

    return {
      site: SITE_ID,
      slug,
      url: window.location.href,
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
   * Create the register button
   */
  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'manga-update-register-btn';
    btn.type = 'button';
    btn.className = 'manga-update-btn';
    updateButtonState(btn, false);

    btn.addEventListener('click', handleButtonClick);

    return btn;
  }

  /**
   * Update button appearance based on registration state
   */
  function updateButtonState(btn, registered) {
    isRegistered = registered;
    if (registered) {
      btn.textContent = 'Registered';
      btn.classList.add('registered');
      btn.title = 'Click to unregister this manga';
    } else {
      btn.textContent = 'Track Updates';
      btn.classList.remove('registered');
      btn.title = 'Click to track updates for this manga';
    }
  }

  /**
   * Handle button click
   */
  async function handleButtonClick() {
    if (!button) return;

    button.disabled = true;
    button.textContent = isRegistered ? 'Removing...' : 'Adding...';

    try {
      if (isRegistered) {
        // Unregister
        await chrome.runtime.sendMessage({
          type: 'DELETE_MANGA',
          id: MANGA_ID
        });
        updateButtonState(button, false);
      } else {
        // Register
        const mangaInfo = extractMangaInfo();
        await chrome.runtime.sendMessage({
          type: 'REGISTER_MANGA',
          manga: mangaInfo
        });
        updateButtonState(button, true);
      }
    } catch (error) {
      console.error('Failed to update manga registration:', error);
      button.textContent = 'Error';
      setTimeout(() => {
        updateButtonState(button, isRegistered);
      }, 2000);
    }

    button.disabled = false;
  }

  /**
   * Check if manga is already registered
   */
  async function checkRegistration() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_MANGA',
        id: MANGA_ID
      });
      return response?.exists || false;
    } catch (error) {
      console.error('Failed to check manga registration:', error);
      return false;
    }
  }

  /**
   * Find the best place to insert the button
   */
  function findInsertTarget() {
    // Look for Bookmark button
    const buttons = document.querySelectorAll('button[type="button"]');
    for (const btn of buttons) {
      if (btn.textContent?.includes('Bookmark')) {
        return btn.parentElement || btn;
      }
    }

    // Fallback: look for action buttons area
    const article = document.querySelector('article');
    if (article) {
      const buttonContainer = article.querySelector('div > button')?.parentElement;
      if (buttonContainer) {
        return buttonContainer;
      }
    }

    return null;
  }

  /**
   * Initialize the content script
   */
  async function init() {
    // Wait for page to be ready
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        window.addEventListener('load', resolve);
      });
    }

    // Small delay to ensure dynamic content is loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if button already exists
    if (document.getElementById('manga-update-register-btn')) {
      return;
    }

    // Find insert target
    const target = findInsertTarget();
    if (!target) {
      console.log('Could not find insert target for register button');
      return;
    }

    // Check registration status
    const registered = await checkRegistration();

    // Create and insert button
    button = createButton();
    updateButtonState(button, registered);

    // Insert button after target
    if (target.parentElement) {
      target.parentElement.insertBefore(button, target.nextSibling);
    } else {
      target.appendChild(button);
    }

    console.log('Manga Update Checker: Button injected');
  }

  // Initialize
  init();

  // Re-initialize on navigation (for SPA-like behavior)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (mangaUrlPattern.test(lastUrl)) {
        setTimeout(init, 1000);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
