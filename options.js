/**
 * Options page script for manga update checker
 */

// DOM Elements
const elements = {
  checkInterval: document.getElementById('check-interval'),
  notificationsEnabled: document.getElementById('notifications-enabled'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  status: document.getElementById('status')
};

// ============= Initialization =============

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  setupEventListeners();
}

function setupEventListeners() {
  // Settings changes
  elements.checkInterval.addEventListener('change', saveSettings);
  elements.notificationsEnabled.addEventListener('change', saveSettings);

  // Export/Import
  elements.exportBtn.addEventListener('click', handleExport);
  elements.importBtn.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', handleImport);
}

// ============= Settings =============

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.settings;

    elements.checkInterval.value = settings.checkInterval;
    elements.notificationsEnabled.checked = settings.notificationsEnabled;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

async function saveSettings() {
  const settings = {
    checkInterval: parseInt(elements.checkInterval.value),
    notificationsEnabled: elements.notificationsEnabled.checked
  };

  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings
    });
    showStatus('Settings saved', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

// ============= Export =============

async function handleExport() {
  elements.exportBtn.disabled = true;
  elements.exportBtn.textContent = 'Exporting...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
    const data = response.data;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `raw-notification-center-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const mangaCount = Object.keys(data.mangas || {}).length;
    showStatus(`Exported ${mangaCount} manga(s)`, 'success');
  } catch (error) {
    console.error('Failed to export:', error);
    showStatus('Failed to export data', 'error');
  } finally {
    elements.exportBtn.disabled = false;
    elements.exportBtn.textContent = 'Export Data';
  }
}

// ============= Import =============

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  elements.importBtn.disabled = true;
  elements.importBtn.textContent = 'Importing...';

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate data
    if (!data.version || data.version !== 1) {
      throw new Error('Invalid file format');
    }

    // Ask user about merge vs replace
    const merge = confirm(
      'Do you want to merge with existing data?\n\n' +
      'OK = Merge (keep existing manga and add new ones)\n' +
      'Cancel = Replace (replace all data with imported data)'
    );

    await chrome.runtime.sendMessage({
      type: 'IMPORT_DATA',
      data,
      merge
    });

    const mangaCount = Object.keys(data.mangas || {}).length;
    showStatus(`Imported ${mangaCount} manga(s)${merge ? ' (merged)' : ''}`, 'success');

    // Reload settings
    await loadSettings();
  } catch (error) {
    console.error('Failed to import:', error);
    showStatus(`Failed to import: ${error.message}`, 'error');
  } finally {
    elements.importBtn.disabled = false;
    elements.importBtn.textContent = 'Import Data';
    elements.importFile.value = '';
  }
}

// ============= Utility =============

function showStatus(message, type) {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.status.className = 'status';
  }, 3000);
}
