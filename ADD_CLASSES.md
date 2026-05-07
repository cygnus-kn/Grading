# How to Add a New Class

This document is intended for future developers or AI assistants. Follow every step in order. Missing a step will cause the class to appear in the sidebar but show no data, or not appear at all.

---

## Prerequisites

Before starting, you need:
1. The **Class ID** (e.g., `S004`). This is the label shown in the sidebar and tabs.
2. The **Google Drive Folder ID** for that class. This is the long string in the folder's URL:
   `https://drive.google.com/drive/folders/<FOLDER_ID_IS_HERE>`
3. The Service Account email (found in `credentials.json` under `"client_email"`) must be added as a **Viewer** on that Google Drive folder. Without this, the Drive API will return a permission error.

---

## Step 1 — Register the Drive folder in `server.js`

Open `server.js` and find the `CLASS_FOLDERS` object (around line 24):

```js
const CLASS_FOLDERS = {
  'S001': '1d_JaEf8uEJgLaAlahXkku_HXX9baO7Ss',
  // Add other IDs here when available
};
```

Add the new class:

```js
const CLASS_FOLDERS = {
  'S001': '1d_JaEf8uEJgLaAlahXkku_HXX9baO7Ss',
  'S004': '<NEW_FOLDER_ID>',  // ← add this line
};
```

---

## Step 2 — Register the class in `public/app.js`

Open `public/app.js` and find the `CLASSES_DATA` object at the very top of the file:

```js
const CLASSES_DATA = {
    'S001': { days: [], loaded: false },
    'S002': { days: [], loaded: false },
    'S003': { days: [], loaded: false }
};
```

Add the new class:

```js
const CLASSES_DATA = {
    'S001': { days: [], loaded: false },
    'S002': { days: [], loaded: false },
    'S003': { days: [], loaded: false },
    'S004': { days: [], loaded: false },  // ← add this line
};
```

> [!IMPORTANT]
> The key here (e.g., `'S004'`) must exactly match the key used in `CLASS_FOLDERS` in `server.js`. They are case-sensitive.

---

## Step 3 — Restart the server

The server must be restarted for the `CLASS_FOLDERS` change to take effect:

```bash
pkill -f "node server.js"
node server.js &
```

---

## Step 4 — Verify

1. Open the app in your browser and **hard refresh** (`Cmd+Shift+R`).
2. The new class (e.g., `S004`) should now appear in the sidebar.
3. Click it to open a tab. The server will call `/api/days?class=S004`, scan the Drive folder, and populate the day list in the sidebar.
4. The result is cached in `cache/days-S004.json` — subsequent loads are instant.

---

## How Days Are Discovered (No Manual Entry Needed)

Day folders are **discovered automatically** from the Drive folder structure. The server scans each student's subfolder for folders whose names contain a day number. Supported naming patterns include:

| Folder name | Matched as |
|------------|------------|
| `Day 1`    | Day 1      |
| `Day01`    | Day 1      |
| `day1`     | Day 1      |
| `Ngày 1`   | Day 1      |
| `ngay1`    | Day 1      |

> [!WARNING]
> Ambiguous names like `Day 1` vs `Day 16` are handled correctly — the match requires the day number to not be followed by another digit. However, folder names that contain no recognizable pattern (e.g., just a date like `15/04`) will be ignored. Students should name their day folders consistently.

---

## How to Refresh the Day Cache

If a new student or day folder is added to Drive after the initial scan, the cache will be stale. To force a re-scan:

**Option A — Via API (recommended):**
```bash
curl -X POST http://localhost:3001/api/cache/refresh \
     -H "Content-Type: application/json" \
     -d '{"class": "S004"}'
```

Omit the body to refresh all classes at once:
```bash
curl -X POST http://localhost:3001/api/cache/refresh
```

**Option B — Delete the cache file manually:**
```bash
rm cache/days-S004.json
```
The next page load will trigger a fresh Drive scan.

---

## Google Drive Folder Structure Expected

```
<Class Root Folder>  ← this ID goes in CLASS_FOLDERS
  └── <Student Name Folder>
        └── <Day Folder>  (e.g., "Day 1", "Ngày 16")
              └── audio files  (.mp3, .m4a, .ogg, etc.)
```

- Each student has **one folder per day** they submitted homework.
- Students with **no folder for a given day** will appear as a blank row in the grading table.
- Audio files are streamed through the Express server via `/api/audio/:fileId`.

---

## Files Changed Checklist

| File | Change |
|------|--------|
| `server.js` | Add class ID → folder ID mapping to `CLASS_FOLDERS` |
| `public/app.js` | Add class ID to `CLASSES_DATA` |
| Server restart | Required after `server.js` changes |
