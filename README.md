# Raw Notification Center

A Chrome extension to track manga updates on rawkuma.net and receive notifications when new chapters are released.

## Features

- **Track Manga Updates**: Add manga to your library directly from rawkuma.net manga pages
- **Periodic Checking**: Automatically checks for updates at configurable intervals (30min - 6 hours)
- **Desktop Notifications**: Get notified when new chapters are available
- **Update History**: View all detected updates with old/new chapter comparison
- **Library Management**: Manage your tracked manga with filtering and sorting options
- **Per-Manga Settings**: Enable/disable notifications for individual manga
- **Read/Unread Status**: Track which updates you've already seen
- **Export/Import**: Backup and restore your library as JSON

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

## Usage

1. **Add Manga to Library**:
   - Visit any manga page on rawkuma.net (e.g., `https://rawkuma.net/manga/manga-name/`)
   - Click the orange "Track Updates" button that appears next to the Bookmark button
   - The manga is now being tracked for updates

2. **View Updates**:
   - Click the extension icon in your toolbar
   - The "Updates" tab shows detected new chapters
   - The "Library" tab shows all tracked manga

3. **Configure Settings**:
   - Click the gear icon in the popup or right-click the extension icon > Options
   - Set your preferred check interval
   - Enable/disable desktop notifications
   - Export/import your data

## File Structure

```
manga-update-checker/
├── manifest.json           # Extension manifest (Manifest V3)
├── background.js           # Service worker for periodic checking
├── content.js              # Injects "Track Updates" button
├── content.css             # Button styles
├── popup.html/css/js       # Main popup interface
├── options.html/js         # Settings page
├── parsers/
│   ├── base.js             # Base parser class (for future sites)
│   ├── rawkuma.js          # Rawkuma-specific parser
│   └── index.js            # Parser registry
├── utils/
│   └── storage.js          # Storage utilities
└── icons/
    └── icon*.png           # Extension icons
```

## Permissions

- `storage`: Store tracked manga and settings
- `alarms`: Schedule periodic update checks
- `notifications`: Show desktop notifications
- `host_permissions` for `rawkuma.net`: Fetch manga pages for update checking

## Adding Support for New Sites

The extension is designed with extensibility in mind. To add a new site:

1. Create a new parser in `parsers/` (extend the pattern from `rawkuma.js`)
2. Register the parser in `parsers/index.js`
3. Add the site to `host_permissions` in `manifest.json`
4. Update content script matches if needed

## License

MIT License
