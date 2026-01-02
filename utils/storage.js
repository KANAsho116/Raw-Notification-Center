/**
 * Storage utility for manga update checker
 * Handles all chrome.storage.local operations
 */

const STORAGE_KEYS = {
  MANGAS: 'mangas',
  SETTINGS: 'settings',
  UPDATES: 'updates'
};

const DEFAULT_SETTINGS = {
  checkInterval: 60, // minutes
  notificationsEnabled: true
};

/**
 * Get all stored mangas
 * @returns {Promise<Object>} Mangas object keyed by id
 */
async function getMangas() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MANGAS);
  return result[STORAGE_KEYS.MANGAS] || {};
}

/**
 * Get a single manga by ID
 * @param {string} id - Manga ID (site:slug format)
 * @returns {Promise<Object|null>}
 */
async function getManga(id) {
  const mangas = await getMangas();
  return mangas[id] || null;
}

/**
 * Save a manga
 * @param {Object} manga - Manga object to save
 * @returns {Promise<void>}
 */
async function saveManga(manga) {
  const mangas = await getMangas();
  const id = `${manga.site}:${manga.slug}`;
  mangas[id] = manga;
  await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });
}

/**
 * Delete a manga
 * @param {string} id - Manga ID to delete
 * @returns {Promise<void>}
 */
async function deleteManga(id) {
  const mangas = await getMangas();
  delete mangas[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });

  // Also remove related updates
  const updates = await getUpdates();
  const filteredUpdates = updates.filter(u => u.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: filteredUpdates });
}

/**
 * Update manga properties
 * @param {string} id - Manga ID
 * @param {Object} updates - Properties to update
 * @returns {Promise<void>}
 */
async function updateManga(id, updates) {
  const mangas = await getMangas();
  if (mangas[id]) {
    mangas[id] = { ...mangas[id], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEYS.MANGAS]: mangas });
  }
}

/**
 * Check if manga exists
 * @param {string} id - Manga ID
 * @returns {Promise<boolean>}
 */
async function mangaExists(id) {
  const mangas = await getMangas();
  return id in mangas;
}

/**
 * Get settings
 * @returns {Promise<Object>}
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * Save settings
 * @param {Object} settings - Settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings }
  });
}

/**
 * Get all updates
 * @returns {Promise<Array>}
 */
async function getUpdates() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.UPDATES);
  return result[STORAGE_KEYS.UPDATES] || [];
}

/**
 * Add an update notification
 * @param {Object} update - Update object
 * @returns {Promise<void>}
 */
async function addUpdate(update) {
  const updates = await getUpdates();

  // Check if update for this manga already exists
  const existingIndex = updates.findIndex(u => u.id === update.id);
  if (existingIndex >= 0) {
    // Update existing
    updates[existingIndex] = update;
  } else {
    // Add new
    updates.unshift(update);
  }

  // Keep only last 100 updates
  const trimmed = updates.slice(0, 100);
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: trimmed });
}

/**
 * Mark an update as read
 * @param {string} id - Manga ID
 * @returns {Promise<void>}
 */
async function markUpdateRead(id) {
  const updates = await getUpdates();
  const updated = updates.map(u =>
    u.id === id ? { ...u, isRead: true } : u
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: updated });
}

/**
 * Mark all updates as read
 * @returns {Promise<void>}
 */
async function markAllUpdatesRead() {
  const updates = await getUpdates();
  const updated = updates.map(u => ({ ...u, isRead: true }));
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: updated });
}

/**
 * Clear all updates
 * @returns {Promise<void>}
 */
async function clearUpdates() {
  await chrome.storage.local.set({ [STORAGE_KEYS.UPDATES]: [] });
}

/**
 * Get unread update count
 * @returns {Promise<number>}
 */
async function getUnreadCount() {
  const updates = await getUpdates();
  return updates.filter(u => !u.isRead).length;
}

/**
 * Export all data as JSON
 * @returns {Promise<Object>}
 */
async function exportData() {
  const [mangas, settings, updates] = await Promise.all([
    getMangas(),
    getSettings(),
    getUpdates()
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    mangas,
    settings,
    updates
  };
}

/**
 * Import data from JSON
 * @param {Object} data - Data to import
 * @param {boolean} merge - Whether to merge with existing data
 * @returns {Promise<void>}
 */
async function importData(data, merge = false) {
  if (!data || data.version !== 1) {
    throw new Error('Invalid data format');
  }

  if (merge) {
    // Merge with existing data
    const existingMangas = await getMangas();
    const mergedMangas = { ...existingMangas, ...data.mangas };

    const existingUpdates = await getUpdates();
    const newUpdateIds = new Set(existingUpdates.map(u => `${u.id}-${u.detectedAt}`));
    const uniqueNewUpdates = data.updates.filter(u =>
      !newUpdateIds.has(`${u.id}-${u.detectedAt}`)
    );
    const mergedUpdates = [...uniqueNewUpdates, ...existingUpdates].slice(0, 100);

    await chrome.storage.local.set({
      [STORAGE_KEYS.MANGAS]: mergedMangas,
      [STORAGE_KEYS.UPDATES]: mergedUpdates
    });
  } else {
    // Replace all data
    await chrome.storage.local.set({
      [STORAGE_KEYS.MANGAS]: data.mangas || {},
      [STORAGE_KEYS.SETTINGS]: data.settings || DEFAULT_SETTINGS,
      [STORAGE_KEYS.UPDATES]: data.updates || []
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    getMangas,
    getManga,
    saveManga,
    deleteManga,
    updateManga,
    mangaExists,
    getSettings,
    saveSettings,
    getUpdates,
    addUpdate,
    markUpdateRead,
    markAllUpdatesRead,
    clearUpdates,
    getUnreadCount,
    exportData,
    importData
  };
}
