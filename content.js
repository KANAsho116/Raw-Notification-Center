/**
 * Content script for manga update checker
 * Injects modern "Track Updates" button on manga pages
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
  let container = null;

  // SVG Icons
  const ICONS = {
    bell: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>`,
    bellRing: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      <path d="M2 8c0-2.2.7-4.3 2-6"/>
      <path d="M22 8a10 10 0 0 0-2-6"/>
    </svg>`,
    check: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>`,
    loader: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>`,
    trash: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`
  };

  /**
   * Extract manga info from the current page
   */
  function extractMangaInfo() {
    // Title - extract from <title> tag (format: "Manga Name - Rawkuma")
    let title = 'Unknown';
    const titleEl = document.querySelector('title');
    if (titleEl) {
      title = titleEl.textContent.replace(/\s*-\s*Rawkuma\s*$/i, '').trim();
    }

    // Thumbnail
    const thumbnailEl = document.querySelector('article img[alt]');
    const thumbnail = thumbnailEl?.src || '';

    // Latest chapter - extract from first chapter link URL
    const chapterLinks = document.querySelectorAll('a[href*="/chapter-"]');
    let latestChapter = '';
    let latestChapterNum = 0;
    let latestChapterUrl = '';

    if (chapterLinks.length > 0) {
      const firstChapterLink = chapterLinks[0];
      latestChapterUrl = firstChapterLink.href;

      // Extract chapter number from URL - only the integer before the dot
      // URL format: /chapter-NUMBER.ID/ (e.g., chapter-185.12345/)
      const chapterNumMatch = latestChapterUrl.match(/\/chapter-(\d+)/i);
      if (chapterNumMatch) {
        latestChapterNum = parseInt(chapterNumMatch[1], 10);
        latestChapter = `Chapter ${chapterNumMatch[1]}`;
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
   * Create the container with button and status
   */
  function createContainer() {
    const div = document.createElement('div');
    div.id = 'manga-update-container';
    div.className = 'manga-update-container';

    // Create button
    const btn = document.createElement('button');
    btn.id = 'manga-update-register-btn';
    btn.type = 'button';
    btn.className = 'manga-update-btn';
    btn.addEventListener('click', handleButtonClick);

    // Create status indicator
    const status = document.createElement('div');
    status.id = 'manga-update-status';
    status.className = 'manga-update-status';

    div.appendChild(btn);
    div.appendChild(status);

    return div;
  }

  /**
   * Update button appearance based on registration state
   */
  function updateButtonState(registered, loading = false) {
    const btn = document.getElementById('manga-update-register-btn');
    const status = document.getElementById('manga-update-status');
    if (!btn) return;

    isRegistered = registered;

    if (loading) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = `${ICONS.loader}<span>Processing...</span>`;
      btn.removeAttribute('data-tooltip');
      return;
    }

    btn.disabled = false;
    btn.classList.remove('loading');

    if (registered) {
      btn.innerHTML = `${ICONS.check}<span>Tracking Updates</span>`;
      btn.classList.add('registered');
      btn.setAttribute('data-tooltip', 'Click to stop tracking');

      if (status) {
        status.className = 'manga-update-status active';
        status.innerHTML = `<span class="status-dot"></span><span>Notifications enabled</span>`;
      }
    } else {
      btn.innerHTML = `${ICONS.bellRing}<span>Track Updates</span>`;
      btn.classList.remove('registered');
      btn.setAttribute('data-tooltip', 'Get notified when new chapters are released');

      if (status) {
        status.className = 'manga-update-status';
        status.innerHTML = `<span class="status-dot"></span><span>Not tracking</span>`;
      }
    }
  }

  /**
   * Handle button click
   */
  async function handleButtonClick() {
    updateButtonState(isRegistered, true);

    try {
      if (isRegistered) {
        // Unregister
        await chrome.runtime.sendMessage({
          type: 'DELETE_MANGA',
          id: MANGA_ID
        });
        updateButtonState(false);
        showToast('Removed from tracking list', 'info');
      } else {
        // Register
        const mangaInfo = extractMangaInfo();
        await chrome.runtime.sendMessage({
          type: 'REGISTER_MANGA',
          manga: mangaInfo
        });
        updateButtonState(true);
        showToast('Now tracking updates!', 'success');
      }
    } catch (error) {
      console.error('Failed to update manga registration:', error);
      updateButtonState(isRegistered);
      showToast('Something went wrong', 'error');
    }
  }

  /**
   * Show a toast notification
   */
  function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.getElementById('manga-update-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'manga-update-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 14px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      font-size: 14px;
      font-weight: 500;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      animation: toast-in 0.3s ease;
    `;
    toast.textContent = message;

    // Add animation keyframes
    if (!document.getElementById('manga-update-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'manga-update-toast-styles';
      style.textContent = `
        @keyframes toast-in {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes toast-out {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(20px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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
   * Find the best place to insert the container
   */
  function findInsertTarget() {
    // Look for the buttons container (Chapter 1 and Bookmark area)
    const buttons = document.querySelectorAll('button[type="button"]');
    for (const btn of buttons) {
      if (btn.textContent?.includes('Bookmark')) {
        // Find the parent container of the buttons
        const parent = btn.closest('div');
        if (parent) {
          return { element: parent, position: 'after' };
        }
      }
    }

    // Alternative: Look for article section with the manga info
    const article = document.querySelector('article');
    if (article) {
      // Find the region with manga details
      const region = article.querySelector('region') || article.querySelector('div');
      if (region) {
        return { element: region, position: 'inside' };
      }
    }

    // Fallback: Insert after the first image in article
    const articleImg = document.querySelector('article img');
    if (articleImg) {
      const imgParent = articleImg.closest('div');
      if (imgParent) {
        return { element: imgParent, position: 'after' };
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
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check if container already exists
    if (document.getElementById('manga-update-container')) {
      return;
    }

    // Find insert target
    const target = findInsertTarget();
    if (!target) {
      console.log('Manga Update Checker: Could not find insert target');
      return;
    }

    // Check registration status
    const registered = await checkRegistration();

    // Create and insert container
    container = createContainer();

    if (target.position === 'after') {
      target.element.parentNode.insertBefore(container, target.element.nextSibling);
    } else {
      target.element.appendChild(container);
    }

    // Update button state
    updateButtonState(registered);

    console.log('Manga Update Checker: UI injected successfully');
  }

  // Initialize
  init();

  // Re-initialize on navigation (for SPA-like behavior)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (mangaUrlPattern.test(lastUrl)) {
        setTimeout(init, 1500);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
