# Grading App Update

Last updated: May 7, 2026

## Current App Summary

This project is a small Express app serving a static grading workspace from `public/`.

- `server.js` serves the frontend and exposes mock API routes.
- `public/index.html` defines the sidebar, workspace header, tab host, day selector, and grading row templates.
- `public/app.js` owns sidebar behavior, tab state, day selection, audio playback, and feedback submission.
- `public/style.css` owns the full visual system.

Google Drive and Google Sheets are still mocked. The app currently fetches hardcoded submissions from `/api/submissions` and logs feedback through `/api/feedback`.

## Changes Made So Far

### Workspace Layout

- Renamed the right-side area conceptually as the workspace.
- Made the workspace fill the browser height with the same vertical geometry as the sidebar.
- Removed workspace slide animation when the sidebar collapses or expands.
- Locked the outer page scroll so the workspace no longer slides vertically.
- Kept only the internal `main` content area scrollable.
- Moved the workspace scrollbar to the left edge of the main content area.
- Made the workspace blank when no class/day is selected.

### Theme And Background

- Set dark mode page background to dark navy: `#071426`.
- Set light mode page background to warm ivory: `#f4f1ec`.
- Disabled the decorative background blobs so the background is clean and solid.

### Sidebar

- Matched the class pill size/style more closely to the Homework project.
- Added the class/people icon to each class pill.
- Added a count badge and chevron group on the right side of each class pill.
- Class pill click now toggles expand/collapse.
- Collapsed chevron points down.
- Expanded chevron rotates to point left.
- Removed blue active highlighting from the class pill itself.
- Kept day/date entry active highlighting.

### Workspace Tabs

- Replaced hardcoded tabs with JS-rendered class tabs.
- Tabs can be opened by clicking sidebar classes.
- Tabs can be closed with a close button.
- Closing the active tab selects the nearest remaining tab.
- Closing all tabs returns the workspace to a blank state.
- Changed tabs to a Firefox-style rounded shape to avoid overlap artifacts.
- Then reshaped tabs into pill-like class tabs similar to the date badge while keeping their shorter fixed length.
- Moved class tabs into the workspace header, immediately to the right of the date selector.

### Date Selector

- Replaced the visible native select with the Homework project's date badge dropdown pattern.
- Kept a hidden native select as the internal state holder.
- Date badge sits at the top-left of the workspace header.
- Dropdown items are rendered from the active class's available days.
- Class clicks no longer auto-load Day 1.
- The workspace waits until the user chooses a specific day before loading submissions.
- Selected days are remembered per class after the user chooses them.

### State Persistence

- Added local caching for the workspace position.
- Restores open class tabs after reload.
- Restores the active class tab after reload.
- Restores the selected day for each class after reload.
- Restores expanded sidebar class groups after reload.
- Restores the main workspace scroll position after reload.
- Restores the saved sidebar width so the workspace returns to the same horizontal position.
- Closing a class tab clears that class's cached day selection, so reopening it starts at `Select day`.

### Grading Behavior

- Existing audio playback controls remain intact.
- Existing feedback submission flow remains intact.
- API calls now include `class` and `day` query params from the active class/day state, although the backend still uses mock data by day only.

## Known Current Limitations

- Google Drive file loading is not implemented yet.
- Google Sheets feedback writing is not implemented yet.
- Class/day data in the sidebar is still hardcoded in `public/app.js`.
- Submission data is still hardcoded in `server.js`.
- The backend accepts a `class` query parameter but does not use it yet.
- The app has no real tests yet.
- `package.json` still lacks a proper `start` script.

## Suggested Next Plan

1. Add project setup polish.
   - Add `npm start`.
   - Point `package.json` main to `server.js`.
   - Add `.env.example` for future Google credentials and IDs.

2. Replace hardcoded sidebar data.
   - Add `/api/classes` or `/api/navigation`.
   - Return classes and available homework days from the backend.
   - Update the frontend sidebar to render from this API.

3. Design the Google Drive folder contract.
   - Decide the folder layout for classes, days, students, and audio files.
   - Map Drive files into the app shape: class, day, student, question, audio URL.

4. Add Google authentication.
   - Choose service account or OAuth depending on whether this is teacher-only or multi-user.
   - Store credentials in environment variables.
   - Use least-privilege Drive and Sheets scopes.

5. Implement real submission loading.
   - Replace `mockSubmissions` with Drive file discovery.
   - Add clear empty/error states when Drive folders or files are missing.
   - Decide whether audio should stream directly from Drive or through the Express server.

6. Implement real feedback saving.
   - Add Google Sheets integration in `/api/feedback`.
   - Include class, day, student, question, notes, timestamp, and grader metadata.
   - Return useful success/error messages to the frontend.

7. Add quality checks.
   - Add basic backend tests for route behavior.
   - Add frontend smoke checks for sidebar, tabs, day selection, audio playback, and feedback submit.
   - Verify the layout in light/dark mode and at smaller viewport sizes.
