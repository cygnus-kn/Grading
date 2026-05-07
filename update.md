# Grading App Update

Last updated: May 7, 2026 (Evening)

## Current App Summary

This project is a small Express app serving a static grading workspace from `public/`.

- `server.js` serves the frontend and exposes API routes now backed by the **Google Drive API**.
- `public/index.html` defines the sidebar, workspace header, tab host, day selector, and grading area.
- `public/app.js` owns sidebar behavior, tab state, day selection, audio playback, feedback submission, and grading table rendering.
- `public/style.css` owns the full visual system.

Google Drive is now **connected for class S001**. Audio files stream through the Express server via a proxy route. Google Sheets feedback writing is still mocked.

---

## Changes Made So Far

### Workspace Layout

- Renamed the right-side area conceptually as the workspace.
- Made the workspace fill the browser height with the same vertical geometry as the sidebar.
- Synchronized the sidebar and workspace expand/collapse animation speed.
- Disabled workspace animation while the sidebar is being resized.
- Locked the outer page scroll so the workspace no longer slides vertically.
- Kept only the internal `main` content area scrollable.
- Moved the workspace scrollbar to the left edge of the main content area.
- Keeps the workspace header visible even when no class/day is selected.
- Keeps the main workspace content blank until the user selects a specific day.
- Moved the workspace divider out of the header border and into a separate container overlay so tabs are not clipped by the divider.

### Theme And Background

- Set dark mode page background to dark navy: `#071426`.
- Set light mode page background to warm ivory: `#f4f1ec`.
- Disabled the decorative background blobs so the background is clean and solid.
- Updated the floating sidebar toggle button to use theme-aware light/dark colors.
- Removed the sidebar aura/glow shadow so the sidebar sits flatter against the page.

### Sidebar

- Matched the class pill size/style more closely to the Homework project.
- Added the class/people icon to each class pill.
- Added a count badge and chevron group on the right side of each class pill.
- Class pill click now opens/activates the class tab only.
- Day list expansion/collapse is controlled only by clicking the chevron.
- Added a circular chevron hitbox with hover/focus background highlighting.
- Collapsed chevron points down. Expanded chevron rotates to point left.
- Removed blue active highlighting from the class pill itself.
- Kept day/date entry active highlighting.
- Reverted class pill height to the original compact sizing.

### Workspace Tabs

- Replaced hardcoded tabs with JS-rendered class tabs.
- Tabs can be opened by clicking sidebar classes.
- Tabs can be closed with a close button.
- Closing the active tab selects the nearest remaining tab.
- Closing all tabs returns the workspace to a blank state.
- Changed tabs to Firefox-style rounded shape, then reshaped into pill-like class tabs.
- Moved class tabs into the workspace header.
- Fixed tab clipping by allowing the tabs row to overflow visibly.
- Tightened tab shadows so they do not collide visually with the workspace divider.

### Date Selector

- Replaced the visible native select with a date badge dropdown pattern.
- Kept a hidden native select as the internal state holder.
- Date badge sits at the top-left of the workspace header.
- Dropdown items are rendered from the active class's available days.
- Sidebar dates and the date selector now use `[Day 01] DD/MM` format.
- Class clicks no longer auto-load Day 1; the workspace waits until the user picks a day.
- Selected days are remembered per class.

### State Persistence

- Restores open class tabs, active class tab, selected day per class, expanded sidebar groups, main workspace scroll position, and sidebar width after reload.
- Closing a class tab clears that class's cached day selection.

### Grading Table

- Replaced the old list-based submission view with a compact **4-column CSS Grid table** (Student, Name, Audio, Comments).
- Each cell is a distinct **curved rectangle** with defined borders, styled for both light and dark themes.
- Sticky column header stays visible while scrolling.
- **Student column** shows the student's name with a minimal SVG chevron icon.
- **Resizable Columns**: The first three columns can be resized by dragging the handles between headers. Column widths are persisted in localStorage.
- Clicking the chevron expands/collapses all extra audio rows for that student.
- Students with **no homework** for the selected day show their name row but leave Name, Audio, and Comments columns blank.
- Every student (including single-audio) has the chevron for visual consistency.

### Expand / Collapse Animation

- Removed `display: none` toggling (which cannot animate).
- Extra rows are wrapped in a `.collapsible-rows-container` div.
- **Expand**: rows cascade in top-to-bottom with 45 ms stagger at 160 ms duration (`cubic-bezier(0.2, 0, 0, 1)`).
- **Collapse**: rows disappear bottom-to-top with 30 ms stagger at 120 ms duration (`cubic-bezier(0.4, 0, 1, 1)`). Container hides only after the last row finishes.
- Uses the **Web Animations API** for precise per-row control.
- Sub-rows use `grid-column-start: 2` on the name cell so no blank student cell box appears.

### Audio Player (Compact)

- Each audio row has a compact play/pause button, scrubber track, and time display.
- Playing a new track pauses all other active players.
- Scrubber progress and knob update live on `timeupdate`.
- Player resets on `ended`.

### Google Drive Integration

- Installed `googleapis` npm package.
- Added `credentials.json` (Service Account key) to the project root.
- `server.js` now authenticates with Google Drive using the Service Account.
- **`CLASS_FOLDERS` map** links class IDs to root Google Drive folder IDs (`S001` → `1d_JaEf8uEJgLaAlahXkku_HXX9baO7Ss`).
- **Folder structure**: Root Folder → Student Folder → Day Folder → Audio Files.
- **Fuzzy day matching**: Matches "Day 16", "Day016", "D16" etc. so diverse student naming is handled automatically.
- **`/api/audio/:fileId`** proxy route streams audio directly from Drive to the browser so the players work without exposing Drive credentials.
- Students with missing Day folders return `answers: []` and render as blank rows.
- Data is fetched **real-time** on every day selection — no caching or sync needed.
- Added **Day 16** to S001 in the frontend to reflect the actual Drive structure.

### Repository

- Added this `update.md` project log.
- Pushed the current UI work to GitHub on `main`.
- Latest pushed commit: `9edaa1b` (`Refine grading workspace UI`).

---

## Known Current Limitations

- **S002 and S003** are not yet connected to Google Drive (they have no root folder ID in `CLASS_FOLDERS`).
- Google Sheets feedback writing is still mocked in `/api/feedback`.
- Class/day data in the sidebar is still hardcoded in `public/app.js`.
- Student day folder naming is diverse — fuzzy matching covers common patterns but edge cases may exist.
- Audio streaming does not support byte-range requests, so scrubbing to an unloaded position may not work yet.
- `credentials.json` is not in `.gitignore` — **must be added before pushing to GitHub**.
- The app has no automated tests yet.

---

## Suggested Next Steps

1. **Add `credentials.json` to `.gitignore`** immediately to avoid leaking the Service Account key.

2. **Connect S002 and S003** to their own Google Drive root folders once the folder IDs are known.

3. **Pull sidebar class/day data from the backend** instead of hardcoding it in `app.js`.

4. **Improve audio scrubbing** by adding byte-range proxy support (`Range` header forwarding).

5. **Improve day folder fuzzy matching** by collecting any unmatched folder names and logging them for review.

6. **Implement real feedback saving** via the Google Sheets API in `/api/feedback`.
   - Schema: class, day, student name, question, comment, timestamp, grader.

7. **Add a loading/error state** for when the Drive API takes too long or returns an error.

8. **Add basic backend tests** for the `/api/submissions` route and the audio proxy.
