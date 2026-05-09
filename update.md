# Grading App Update

Last updated: May 9, 2026

## Current App Summary

This project is an Express + static frontend grading workspace.

- `server.js` is now a small Vercel/local entrypoint.
- Backend logic lives in `src/`.
- `public/index.html`, `public/app.js`, and `public/style.css` serve the grading UI.
- Supabase Postgres stores Google Drive metadata so day/submission pages load quickly.
- Google Drive still stores the actual audio files.
- `/api/audio/:fileId` streams audio from Google Drive through the server.

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
- `src/services/driveService.js`: Drive folder/file scanning and audio streaming.
- `src/services/supabaseMetadataService.js`: Supabase reads and Drive-to-Supabase sync.
- `src/services/cacheService.js`: local fallback file/memory cache.
- `src/services/submissionsService.js`: fallback Drive submission assembly.

---

## Current Data Flow

Normal day/submission loading:

```text
Browser -> Express API -> Supabase metadata -> render table
```

Audio playback:

```text
Browser -> /api/audio/:fileId -> Google Drive stream
```

Refresh/sync:

```text
Class reload button -> Express API -> scan Google Drive -> upsert Supabase metadata
```

This avoids scanning Drive on every day click. Drive is now used only for sync and audio streaming.

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

Synced metadata currently contains:

- 13 students
- 17 days
- 120 submissions
- 635 audio file metadata rows

Verified Day 17:

- 13 students
- 65 audio files

---

## API Routes

- `GET /api/classes`
  - Reads Supabase classes and their available days.
  - Falls back to local Drive config/cache if Supabase fails.

- `GET /api/days?class=S136`
  - Reads day metadata from Supabase.
  - Falls back to Drive scan if Supabase fails.

- `GET /api/submissions?class=S136&day=17`
  - Reads students/submissions/audio metadata from Supabase.
  - Falls back to Drive scan if Supabase fails.

- `POST /api/cache/refresh`
  - With Supabase configured, syncs Drive metadata into Supabase.
  - Kept under the old route name so the existing frontend reload button still works.

- `POST /api/sync/class`
  - Explicit sync endpoint.
  - Body: `{ "class": "S136" }`

- `GET /api/audio/:fileId`
  - Streams actual audio from Google Drive.

- `POST /api/feedback`
  - Still mocked.

---

## Frontend Notes

- `public/app.js` now accepts classes returned by `/api/classes`, so new Supabase-backed classes can appear without hardcoding every class in the initial object.
- Student sorting happens on the frontend before table rendering using Vietnamese collation.
- Browser localStorage still caches day/submission responses for quick revisits.
- The class reload button clears browser day/submission cache for that class after sync.
- A browser-tab SVG favicon lives at `public/favicon.svg`.

---

## Deployment Notes

Production URL:

```text
https://grading-self.vercel.app/
```

After Vercel env vars were added and redeployed:

- `/api/classes` returns `S136` with days `1-17`.
- `/api/submissions?class=S136&day=17` returns 13 students and 65 audio files.

Vercel must have:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CREDENTIALS`

If Vercel returns `days: []` from `/api/classes`, redeploy after checking Supabase env vars.

---

## Known Current Limitations

- Feedback writing is still mocked in `/api/feedback`.
- Audio streaming does not implement byte-range forwarding yet, so seeking into unloaded audio may be limited.
- The Supabase sync currently supports the `student-first` layout.
- There are no automated tests yet.
- Sync can still be slow because it scans Drive, but normal day clicks are fast because they read Supabase.

---

## Suggested Next Steps

1. Implement real feedback saving in Supabase or Google Sheets.
2. Add byte-range support to `/api/audio/:fileId`.
3. Add sync status and `last_synced_at` display in the UI.
4. Add a small admin-only sync endpoint guard before adding more users.
5. Add backend tests for Supabase reads, Drive fallback, and sync logic.
