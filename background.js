/**
 * Background service worker for manga update checker
 * Handles periodic update checks and notifications
 */

const ALARM_NAME = 'manga-update-check';
const DEFAULT_CHECK_INTERVAL = 60; // minutes

// Storage keys
const STORAGE_KEYS = {
  MANGAS: 'mangas',
  SETTINGS: 'settings',
  UPDATES: 'updates'
};

const DEFAULT_SETTINGS = {
  checkInterval: 60,
  notificationsEnabled: true
};

// ============= Storage Functions =============

async function getMangas() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MANGAS);
  return result[STORAGE_KEYS.MANGAS] || {};
}

async function getManga(id) {
  const mangas = await getMangas();
  return mangas[id] || null;
}

async function saveManga(manga) {
  const mangas = await getMangas();
  const id = `${manga.site}:${manga.slug}`;
  mangas[id] = manga;
  await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });
}

async function deleteManga(id) {
  const mangas = await getMangas();
  delete mangas[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });

  const updates = await getUpdates();
  const filteredUpdates = updates.filter(u => u.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: filteredUpdates });
}

async function updateManga(id, updates) {
  const mangas = await getMangas();
  if (mangas[id]) {
    mangas[id] = { ...mangas[id], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });
  }
}

async function mangaExists(id) {
  const mangas = await getMangas();
  return id in mangas;
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings }
  });
}

async function getUpdates() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.UPDATES);
  return result[STORAGE_KEYS.UPDATES] || [];
}

async function addUpdate(update) {
  const updates = await getUpdates();
  const existingIndex = updates.findIndex(u => u.id === update.id);

  if (existingIndex >= 0) {
    updates[existingIndex] = update;
  } else {
    updates.unshift(update);
  }

  const trimmed = updates.slice(0, 100);
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: trimmed });
}

async function getUnreadCount() {
  const updates = await getUpdates();
  return updates.filter(u => !u.isRead).length;
}

// ============= Parser Functions =============

function extractChapterNumber(chapterStr) {
  if (!chapterStr) return 0;
  const match = chapterStr.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

async function fetchMangaInfo(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const html = await response.text();

  // Extract manga slug from URL
  const slugMatch = url.match(/\/manga\/([^\/]+)\/?$/);
  const slug = slugMatch ? slugMatch[1] : '';

  // Title - extract from <title> tag (format: "Manga Name - Rawkuma")
  let title = 'Unknown';
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    // Remove " - Rawkuma" suffix
    title = titleMatch[1].replace(/\s*-\s*Rawkuma\s*$/i, '').trim();
  }

  // Thumbnail - extract og:image meta tag (more reliable)
  let thumbnail = '';
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    thumbnail = ogImageMatch[1];
  }

  // Extract manga_id for API call
  const mangaIdMatch = html.match(/manga_id[=:](\d+)/);
  const mangaId = mangaIdMatch ? mangaIdMatch[1] : null;

  let latestChapter = '';
  let latestChapterNum = 0;
  let latestChapterUrl = '';
  let lastUpdated = '';

  // Fetch chapter list from API if manga_id is available
  if (mangaId) {
    try {
      const apiUrl = `https://rawkuma.net/wp-admin/admin-ajax.php?manga_id=${mangaId}&page=1&action=chapter_list`;
      const apiResponse = await fetch(apiUrl);
      if (apiResponse.ok) {
        const chapterHtml = await apiResponse.text();

        // Extract first (latest) chapter number from data-chapter-number attribute
        const chapterNumMatch = chapterHtml.match(/data-chapter-number=["'](\d+)["']/);
        if (chapterNumMatch) {
          latestChapterNum = parseInt(chapterNumMatch[1], 10);
          latestChapter = `Chapter ${chapterNumMatch[1]}`;
        }

        // Extract chapter URL
        const chapterUrlMatch = chapterHtml.match(/href=["']([^"']*\/chapter-[^"']*)["']/);
        if (chapterUrlMatch) {
          latestChapterUrl = chapterUrlMatch[1].trim();
          if (!latestChapterUrl.startsWith('http')) {
            latestChapterUrl = `https://rawkuma.net${latestChapterUrl}`;
          }
        }

        // Extract last updated time from first chapter
        const timeMatch = chapterHtml.match(/<time[^>]*>([^<]+)<\/time>/);
        if (timeMatch) {
          lastUpdated = timeMatch[1].trim();
        }
      }
    } catch (apiError) {
      console.error('Failed to fetch chapter list API:', apiError);
    }
  }

  // Fallback: try to extract from main page if API failed
  if (!latestChapterNum) {
    const chapterLinkMatch = html.match(/<a[^>]+href=["']([^"']*\/chapter-(\d+)[^"']*)["'][^>]*>/i);
    if (chapterLinkMatch) {
      latestChapterUrl = chapterLinkMatch[1].trim();
      if (!latestChapterUrl.startsWith('http')) {
        latestChapterUrl = new URL(latestChapterUrl, url).href;
      }
      const numMatch = latestChapterUrl.match(/\/chapter-(\d+)/i);
      if (numMatch) {
        latestChapterNum = parseInt(numMatch[1], 10);
        latestChapter = `Chapter ${numMatch[1]}`;
      }
    }
  }

  return {
    site: 'rawkuma',
    slug,
    url,
    title,
    thumbnail,
    latestChapter,
    latestChapterNum,
    latestChapterUrl,
    lastUpdated
  };
}

// ============= Update Check Functions =============

async function checkMangaForUpdate(manga) {
  try {
    const newInfo = await fetchMangaInfo(manga.url);

    // Compare chapter numbers
    const hasUpdate = newInfo.latestChapterNum > manga.latestChapterNum;

    if (hasUpdate) {
      return {
        hasUpdate: true,
        oldChapter: manga.latestChapter,
        newChapter: newInfo.latestChapter,
        newChapterNum: newInfo.latestChapterNum,
        lastUpdated: newInfo.lastUpdated
      };
    }

    return { hasUpdate: false, lastUpdated: newInfo.lastUpdated };
  } catch (error) {
    console.error(`Failed to check update for ${manga.title}:`, error);
    return { hasUpdate: false, error: error.message };
  }
}

async function checkAllMangasForUpdates() {
  const mangas = await getMangas();
  const settings = await getSettings();
  const mangaList = Object.values(mangas);

  if (mangaList.length === 0) {
    console.log('No mangas to check');
    return;
  }

  console.log(`Checking ${mangaList.length} manga(s) for updates...`);

  let updatedCount = 0;

  for (const manga of mangaList) {
    const result = await checkMangaForUpdate(manga);

    // Update last checked time
    await updateManga(`${manga.site}:${manga.slug}`, {
      lastChecked: Date.now(),
      lastUpdated: result.lastUpdated || manga.lastUpdated
    });

    if (result.hasUpdate) {
      updatedCount++;

      // Update manga with new chapter info
      await updateManga(`${manga.site}:${manga.slug}`, {
        latestChapter: result.newChapter,
        latestChapterNum: result.newChapterNum,
        isRead: false
      });

      // Add to updates list
      await addUpdate({
        id: `${manga.site}:${manga.slug}`,
        site: manga.site,
        slug: manga.slug,
        title: manga.title,
        thumbnail: manga.thumbnail,
        url: manga.url,
        oldChapter: result.oldChapter,
        newChapter: result.newChapter,
        detectedAt: Date.now(),
        isRead: false
      });

      // Send notification if enabled
      if (settings.notificationsEnabled && manga.notifyEnabled) {
        await sendNotification(manga, result.newChapter);
      }
    }

    // Small delay between requests to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Update badge
  await updateBadge();

  console.log(`Update check complete. ${updatedCount} manga(s) updated.`);
}

// ============= Notification Functions =============

async function sendNotification(manga, newChapter) {
  const notificationId = `manga-update-${manga.site}-${manga.slug}-${Date.now()}`;

  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Manga Update',
    message: `${manga.title} has a new chapter: ${newChapter}`,
    priority: 2
  });
}

// ============= Badge Functions =============

async function updateBadge() {
  const count = await getUnreadCount();

  if (count > 0) {
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// ============= Alarm Functions =============

async function setupAlarm() {
  const settings = await getSettings();
  const intervalMinutes = settings.checkInterval || DEFAULT_CHECK_INTERVAL;

  // Clear existing alarm
  await chrome.alarms.clear(ALARM_NAME);

  // Create new alarm
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // First check after 1 minute
    periodInMinutes: intervalMinutes
  });

  console.log(`Alarm set to check every ${intervalMinutes} minutes`);
}

// ============= Message Handlers =============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, message);

  (async () => {
    try {
      switch (message.type) {
        case 'REGISTER_MANGA':
          console.log('Registering manga:', message.manga?.title);
          await saveManga(message.manga);
          console.log('Manga saved successfully');
          sendResponse({ success: true });
          break;

        case 'DELETE_MANGA':
          await deleteManga(message.id);
          await updateBadge();
          sendResponse({ success: true });
          break;

        case 'CHECK_MANGA':
          const exists = await mangaExists(message.id);
          sendResponse({ exists });
          break;

        case 'GET_MANGAS':
          const mangas = await getMangas();
          console.log('GET_MANGAS returning:', Object.keys(mangas).length, 'mangas');
          sendResponse({ mangas });
          break;

        case 'GET_UPDATES':
          const updates = await getUpdates();
          sendResponse({ updates });
          break;

        case 'GET_SETTINGS':
          const settings = await getSettings();
          sendResponse({ settings });
          break;

        case 'SAVE_SETTINGS':
          await saveSettings(message.settings);
          await setupAlarm(); // Re-setup alarm with new interval
          sendResponse({ success: true });
          break;

        case 'MARK_READ':
          await updateManga(message.id, { isRead: true });
          // Also mark in updates
          const allUpdates = await getUpdates();
          const updatedUpdates = allUpdates.map(u =>
            u.id === message.id ? { ...u, isRead: true } : u
          );
          await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: updatedUpdates });
          await updateBadge();
          sendResponse({ success: true });
          break;

        case 'MARK_ALL_READ':
          const mangasToUpdate = await getMangas();
          for (const id of Object.keys(mangasToUpdate)) {
            mangasToUpdate[id].isRead = true;
          }
          await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangasToUpdate });

          const updatesToMark = await getUpdates();
          const markedUpdates = updatesToMark.map(u => ({ ...u, isRead: true }));
          await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: markedUpdates });
          await updateBadge();
          sendResponse({ success: true });
          break;

        case 'TOGGLE_NOTIFY':
          await updateManga(message.id, { notifyEnabled: message.enabled });
          sendResponse({ success: true });
          break;

        case 'CHECK_NOW':
          await checkAllMangasForUpdates();
          sendResponse({ success: true });
          break;

        case 'EXPORT_DATA':
          const exportMangas = await getMangas();
          const exportSettings = await getSettings();
          const exportUpdates = await getUpdates();
          sendResponse({
            data: {
              version: 1,
              exportedAt: new Date().toISOString(),
              mangas: exportMangas,
              settings: exportSettings,
              updates: exportUpdates
            }
          });
          break;

        case 'IMPORT_DATA':
          const importData = message.data;
          if (!importData || importData.version !== 1) {
            sendResponse({ success: false, error: 'Invalid data format' });
            break;
          }

          if (message.merge) {
            const existingMangas = await getMangas();
            const mergedMangas = { ...existingMangas, ...importData.mangas };
            await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mergedMangas });
          } else {
            await chrome.storage.local.set({
              [STORAGE_KEYS.MANGAS]: importData.mangas || {},
              [STORAGE_KEYS.SETTINGS]: importData.settings || DEFAULT_SETTINGS,
              [STORAGE_KEYS.UPDATES]: importData.updates || []
            });
          }

          await setupAlarm();
          await updateBadge();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

// ============= Event Listeners =============

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllMangasForUpdates();
  }
});

// Notification click handler
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // Extract manga info from notification ID
  const match = notificationId.match(/manga-update-(\w+)-(.+)-\d+/);
  if (match) {
    const [, site, slug] = match;
    const id = `${site}:${slug}`;
    const manga = await getManga(id);

    if (manga?.url) {
      await chrome.tabs.create({ url: manga.url });

      // Mark as read
      await updateManga(id, { isRead: true });
      await updateBadge();
    }
  }

  chrome.notifications.clear(notificationId);
});

// Install handler
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);

  // Initialize storage with defaults if needed
  const settings = await getSettings();
  await saveSettings(settings);

  // Setup alarm
  await setupAlarm();

  // Update badge
  await updateBadge();
});

// Startup handler
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');

  // Setup alarm
  await setupAlarm();

  // Update badge
  await updateBadge();
});
