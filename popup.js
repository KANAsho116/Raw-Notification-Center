/**
 * Popup script for manga update checker
 */

// DOM Elements
const elements = {
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  updatesList: document.getElementById('updates-list'),
  updatesEmpty: document.getElementById('updates-empty'),
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),
  filterSelect: document.getElementById('filter-select'),
  sortSelect: document.getElementById('sort-select'),
  markAllReadBtn: document.getElementById('mark-all-read-btn'),
  checkNowBtn: document.getElementById('check-now-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  loading: document.getElementById('loading')
};

// State
let currentTab = 'updates';
let mangas = {};
let updates = [];

// ============= Initialization =============

document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('Popup init started');
  setupEventListeners();

  // Show loading state
  if (elements.loading) {
    elements.loading.classList.remove('hidden');
  }

  await loadData();

  // Hide loading state
  if (elements.loading) {
    elements.loading.classList.add('hidden');
  }

  renderCurrentTab();
  console.log('Popup init completed');
}

function setupEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Filter & Sort
  elements.filterSelect.addEventListener('change', renderCurrentTab);
  elements.sortSelect.addEventListener('change', renderCurrentTab);

  // Actions
  elements.markAllReadBtn.addEventListener('click', handleMarkAllRead);
  elements.checkNowBtn.addEventListener('click', handleCheckNow);
  elements.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ============= Data Loading =============

async function loadData() {
  console.log('loadData started');

  // Read directly from chrome.storage.local for reliability
  try {
    const result = await chrome.storage.local.get(['mangas', 'updates']);
    console.log('Storage result:', result);

    mangas = result.mangas || {};
    updates = result.updates || [];

    console.log('Loaded mangas:', Object.keys(mangas).length, mangas);
    console.log('Loaded updates:', updates.length);
  } catch (error) {
    console.error('Failed to load data from storage:', error);
    mangas = {};
    updates = [];
  }
}

// ============= Tab Management =============

function switchTab(tabName) {
  currentTab = tabName;

  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });

  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'updates') {
    renderUpdates();
  } else {
    renderLibrary();
  }
}

// ============= Updates Tab =============

function renderUpdates() {
  const filter = elements.filterSelect.value;
  const sort = elements.sortSelect.value;

  let filteredUpdates = [...updates];

  // Filter
  if (filter === 'unread') {
    filteredUpdates = filteredUpdates.filter(u => !u.isRead);
  } else if (filter === 'read') {
    filteredUpdates = filteredUpdates.filter(u => u.isRead);
  }

  // Sort
  filteredUpdates.sort((a, b) => {
    if (sort === 'updated') {
      return b.detectedAt - a.detectedAt;
    } else if (sort === 'added') {
      return b.detectedAt - a.detectedAt;
    } else if (sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Render
  if (filteredUpdates.length === 0) {
    elements.updatesList.innerHTML = '';
    elements.updatesEmpty.classList.remove('hidden');
  } else {
    elements.updatesEmpty.classList.add('hidden');
    elements.updatesList.innerHTML = filteredUpdates.map(update => createUpdateItem(update)).join('');

    // Add event listeners
    elements.updatesList.querySelectorAll('.manga-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          handleOpenManga(item.dataset.id);
        }
      });
    });

    elements.updatesList.querySelectorAll('.mark-read-btn').forEach(btn => {
      btn.addEventListener('click', () => handleMarkRead(btn.dataset.id));
    });
  }
}

function createUpdateItem(update) {
  const timeAgo = formatTimeAgo(update.detectedAt);

  return `
    <div class="manga-item ${update.isRead ? '' : 'unread'}" data-id="${update.id}">
      <img class="manga-thumbnail" src="${update.thumbnail || 'icons/icon48.png'}" alt="${update.title}">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(update.title)}</div>
        <div class="manga-chapter">
          <span class="old">${escapeHtml(update.oldChapter)}</span>
          <span class="new">${escapeHtml(update.newChapter)}</span>
        </div>
        <div class="manga-time">${timeAgo}</div>
      </div>
      <div class="manga-actions">
        <button class="mark-read-btn ${update.isRead ? '' : 'active'}" data-id="${update.id}" title="${update.isRead ? 'Already read' : 'Mark as read'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ============= Library Tab =============

function renderLibrary() {
  console.log('renderLibrary called, mangas object:', mangas);
  console.log('mangas keys:', Object.keys(mangas));

  const filter = elements.filterSelect.value;
  const sort = elements.sortSelect.value;

  let mangaList = Object.values(mangas);
  console.log('mangaList length:', mangaList.length);

  // Filter
  if (filter === 'unread') {
    mangaList = mangaList.filter(m => !m.isRead);
  } else if (filter === 'read') {
    mangaList = mangaList.filter(m => m.isRead);
  }

  // Sort
  mangaList.sort((a, b) => {
    if (sort === 'updated') {
      return b.lastChecked - a.lastChecked;
    } else if (sort === 'added') {
      return b.addedAt - a.addedAt;
    } else if (sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Render
  if (mangaList.length === 0) {
    elements.libraryList.innerHTML = '';
    elements.libraryEmpty.classList.remove('hidden');
  } else {
    elements.libraryEmpty.classList.add('hidden');
    elements.libraryList.innerHTML = mangaList.map(manga => createLibraryItem(manga)).join('');

    // Add event listeners
    elements.libraryList.querySelectorAll('.manga-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          handleOpenManga(item.dataset.id);
        }
      });
    });

    elements.libraryList.querySelectorAll('.notify-btn').forEach(btn => {
      btn.addEventListener('click', () => handleToggleNotify(btn.dataset.id, btn.classList.contains('active')));
    });

    elements.libraryList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteManga(btn.dataset.id));
    });
  }
}

function createLibraryItem(manga) {
  const id = `${manga.site}:${manga.slug}`;

  return `
    <div class="manga-item ${manga.isRead ? '' : 'unread'}" data-id="${id}">
      <img class="manga-thumbnail" src="${manga.thumbnail || 'icons/icon48.png'}" alt="${manga.title}">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(manga.title)}</div>
        <div class="manga-chapter">${escapeHtml(manga.latestChapter || 'No chapters')}</div>
        <div class="manga-time">${manga.lastUpdated || 'Unknown'}</div>
      </div>
      <div class="manga-actions">
        <button class="notify-btn ${manga.notifyEnabled ? 'active' : ''}" data-id="${id}" title="${manga.notifyEnabled ? 'Notifications on' : 'Notifications off'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${manga.notifyEnabled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        <button class="delete delete-btn" data-id="${id}" title="Remove from library">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ============= Event Handlers =============

async function handleOpenManga(id) {
  const manga = mangas[id];
  if (manga?.url) {
    await chrome.tabs.create({ url: manga.url });
    await handleMarkRead(id);
  }
}

async function handleMarkRead(id) {
  try {
    await chrome.runtime.sendMessage({ type: 'MARK_READ', id });
    await loadData();
    renderCurrentTab();
  } catch (error) {
    console.error('Failed to mark as read:', error);
  }
}

async function handleMarkAllRead() {
  try {
    await chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' });
    await loadData();
    renderCurrentTab();
  } catch (error) {
    console.error('Failed to mark all as read:', error);
  }
}

async function handleToggleNotify(id, currentlyEnabled) {
  try {
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_NOTIFY',
      id,
      enabled: !currentlyEnabled
    });
    await loadData();
    renderCurrentTab();
  } catch (error) {
    console.error('Failed to toggle notifications:', error);
  }
}

async function handleDeleteManga(id) {
  if (!confirm('Remove this manga from your library?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'DELETE_MANGA', id });
    await loadData();
    renderCurrentTab();
  } catch (error) {
    console.error('Failed to delete manga:', error);
  }
}

async function handleCheckNow() {
  elements.checkNowBtn.classList.add('spinning');
  elements.checkNowBtn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
    await loadData();
    renderCurrentTab();
  } catch (error) {
    console.error('Failed to check for updates:', error);
  } finally {
    elements.checkNowBtn.classList.remove('spinning');
    elements.checkNowBtn.disabled = false;
  }
}

// ============= Utility Functions =============

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
