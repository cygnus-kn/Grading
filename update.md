# Grading App Update

Last updated: May 12, 2026

## Current App Summary

This project is an Express + static frontend grading workspace.

- `server.js` is now a small Vercel/local entrypoint.
- Backend logic lives in `src/`.
- `public/index.html`, `public/app.js`, and `public/style.css` serve the grading UI.
- Supabase Postgres stores Google Drive metadata so day/submission pages load quickly.
- Google Drive still stores the actual homework files.
- Submission files can be audio, images, Google Docs, `.docx`, PDFs, or other Drive files.
- `/api/audio/:fileId` remains for compatibility, and `/api/files/:fileId/content` streams generic Drive files.
- `/api/files/:fileId/export?format=pdf` exports Google Workspace documents for preview.

Current active class:

- `S136`
- Drive folder: `1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r`
- Layout: `student-first`

---

## Backend Layout

```text
server.js
src/
  app.js
  config/
    classFolders.js
    googleDrive.js
    supabase.js
  routes/
    apiRoutes.js
  services/
    cacheService.js
    driveService.js
    submissionsService.js
    supabaseMetadataService.js
  utils/
    days.js
```

Responsibilities:

- `src/config/classFolders.js`: fallback class config for Drive folder IDs.
- `src/config/googleDrive.js`: Google Drive auth using `GOOGLE_CREDENTIALS` or local `credentials.json`.
- `src/config/supabase.js`: Supabase client using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `src/routes/apiRoutes.js`: API endpoints.
- `src/services/driveService.js`: Drive folder/file scanning, recursive day-folder submission discovery, file classification, file streaming, and Google Docs export.
- `src/services/supabaseMetadataService.js`: Supabase reads and Drive-to-Supabase sync.
- `src/services/cacheService.js`: local fallback file/memory cache.
- `src/services/submissionsService.js`: fallback Drive submission assembly.

---

## Current Data Flow

Normal day/submission loading:

```text
Browser -> Express API -> Supabase metadata -> render table
```

Audio playback / writing preview:

```text
Browser -> /api/audio/:fileId -> Google Drive stream
Browser -> /api/files/:fileId/content -> Google Drive stream
Browser -> /api/files/:fileId/export?format=pdf -> Google Docs PDF export
```

Refresh/sync:

```text
Class reload button -> Express API -> scan Google Drive -> upsert Supabase metadata
```

This avoids scanning Drive on every day click after Supabase is synced. Drive is now used for sync, file streaming, and document export.

Submission discovery during sync/Drive fallback searches recursively inside each day folder, so this layout is supported:

```text
Student Folder
  Day 1
    Nested Folder
      audio, image, doc, PDF, or other submission files
```

---

## Environment Variables

Local `.env` and Vercel must define:

```text
SUPABASE_URL=https://yaqcrnpbkildloxanrql.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
GOOGLE_CREDENTIALS=<full service-account JSON, Vercel only>
```

Local development can use `credentials.json` instead of `GOOGLE_CREDENTIALS`.

Do not commit:

- `.env`
- `credentials.json`
- `cache/`

`.env.example` is safe and should keep placeholders only.

---

## Supabase

The schema is recorded in `supabase-schema.sql`.

Tables:

- `classes`
- `students`
- `days`
- `submissions`
- `audio_files`
- `submission_files`

`audio_files` is retained for legacy compatibility. New submission metadata is stored in `submission_files`.

Current metadata notes:

- 13 students
- 18 days observed locally
- submission files now include writing documents as well as audio

Verified locally on May 12, 2026:

- Day 18 returns 13 students and writing document submissions.
- Google Docs export endpoint returned `200 application/pdf`.

Verified Day 1 after recursive audio discovery:

- 13 students
- audio files inside nested folders under `Day 1` are included

---

## API Routes

- `GET /api/classes`
  - Reads Supabase classes and their available days.
  - Falls back to local Drive config/cache if Supabase fails.

- `GET /api/days?class=S136`
  - Reads day metadata from Supabase.
  - Falls back to Drive scan if Supabase fails.

- `GET /api/submissions?class=S136&day=18`
  - Reads students/submissions/submission-file metadata from Supabase.
  - Falls back to Drive scan if Supabase fails.

- `POST /api/cache/refresh`
  - With Supabase configured, syncs Drive metadata into Supabase.
  - Kept under the old route name so the existing frontend reload button still works.

- `POST /api/sync/class`
  - Explicit sync endpoint.
  - Body: `{ "class": "S136" }`

- `GET /api/audio/:fileId`
  - Streams actual audio from Google Drive. Kept for compatibility.

- `GET /api/files/:fileId/content`
  - Streams a generic Drive file through the server.

- `GET /api/files/:fileId/export?format=pdf`
  - Exports Google Workspace files, currently PDF or text, through the server.

- `POST /api/feedback`
  - Saves a comment for a specific (class, student, day, question_label) to Supabase.
  - Body: `{ "class": "S136", "studentId": "...", "day": 18, "question": "...", "comment": "..." }`
  - Uses upsert: re-saving overwrites the previous comment.
  - Falls back to console logging if Supabase is not configured.

---

## Frontend Notes

- `public/app.js` now accepts classes returned by `/api/classes`, so new Supabase-backed classes can appear without hardcoding every class in the initial object.
- Student sorting happens on the frontend before table rendering using Vietnamese collation.
- Browser localStorage still caches day/submission responses for quick revisits.
- The class reload button clears browser day/submission cache for that class after sync.
- A browser-tab SVG favicon lives at `public/favicon.svg`.
- The table column formerly named `Audio` is now `Submission`.
- The Name column shows file names without extensions and is display-only.
- File-type icons appear in the Name column.
- The Submission column renders an audio player or Preview button plus a separate square Google Drive folder button.
- Missing homework rows render blank Name, Submission, Drive-folder, and Comments boxes to preserve the table grid.
- Preview supports audio, images, PDFs, Google Docs exported as PDF, and Drive preview/fallback links.
- The Comments column persists per-submission comments in Supabase.
  - Existing comments are pre-filled on load.
  - Comments save on send-button click, Enter key, or input blur (auto-save).
  - Visual states: dirty (blue highlight), saving (dimmed), saved (green checkmark), error (red).

---

## Deployment Notes

Production URL:

```text
https://grading-self.vercel.app/
```

After Vercel env vars were added and redeployed:

- `/api/classes` should return `S136`.
- `/api/submissions?class=S136&day=18` should return 13 students and any submission files for Day 18 after deploy/sync.

Vercel must have:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CREDENTIALS`

If Vercel returns `days: []` from `/api/classes`, redeploy after checking Supabase env vars.

---

## Known Current Limitations

- Audio streaming does not implement byte-range forwarding yet, so seeking into unloaded audio may be limited.
- The Supabase sync currently supports the `student-first` layout.
- Automated tests currently cover day-folder parsing only.
- Sync can still be slow because it scans Drive, but normal day clicks are fast because they read Supabase.
- Recursive submission discovery makes sync heavier, but it handles student-created nested folders inside day folders.
- HEIC files are classified as images, but browser-native preview support depends on the browser. The UI falls back to Drive/open links where needed.

---

## Suggested Next Steps

1. Add byte-range support to `/api/audio/:fileId`.
2. Add sync status and `last_synced_at` display in the UI.
3. Add a small admin-only sync endpoint guard before adding more users.
4. Add backend tests for Supabase reads, Drive fallback, file classification, sync, and comments.
5. Add OCR/text extraction for writing submissions if grading needs searchable text.
6. Add comment history / audit trail if edit tracking is needed.
