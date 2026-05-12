# How to Add a New Class

This app now uses Supabase Postgres as the metadata cache. Google Drive still stores the actual homework files.

Adding a class means:

1. Give the Google service account access to the Drive folder.
2. Add the class to Supabase.
3. Add a fallback entry in the code.
4. Run a sync so Supabase has students/days/submission-file metadata.

---

## Prerequisites

You need:

1. Class ID, for example `S137`.
2. Google Drive root folder ID.
3. Folder layout. Current supported sync layout is `student-first`.
4. Service Account email from `credentials.json` under `client_email`.

The Drive folder must be shared with the service account as **Viewer**.

Expected `student-first` structure:

```text
<Class Root Folder>
  <Student Folder>
    <Day Folder>
      audio, image, document, PDF, or other submission files
```

Nested folders inside a day folder are also supported:

```text
<Class Root Folder>
  <Student Folder>
    <Day Folder>
      <Nested Folder>
        audio, image, document, PDF, or other submission files
```

The app classifies submissions as audio, image, document, or generic file. Writing homework can be Google Docs, `.docx`, PDFs, or image files such as `.jpg`, `.png`, and `.heic`.

Supported day names include:

| Folder name | Matched as |
|------------|------------|
| `Day 1` | Day 1 |
| `Day01` | Day 1 |
| `day1` | Day 1 |
| `Ngày 1` | Day 1 |
| `ngay1` | Day 1 |
| `D1` | Day 1 |
| `HW1` | Day 1 |
| `Homework 1` | Day 1 |
| `1` | Day 1 |
| `Day 1_23.03.26` | Day 1 |

---

## Step 1 - Add The Class To Supabase

Open Supabase SQL Editor and run:

```sql
insert into classes (id, drive_folder_id, layout)
values ('S137', '<NEW_FOLDER_ID>', 'student-first')
on conflict (id) do update set
  drive_folder_id = excluded.drive_folder_id,
  layout = excluded.layout;
```

Replace:

- `S137` with the real class ID.
- `<NEW_FOLDER_ID>` with the Google Drive folder ID.

---

## Step 2 - Add Fallback Config In Code

Open `src/config/classFolders.js`.

Add the class:

```js
const CLASS_FOLDERS = {
  S136: {
    folderId: '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r',
    layout: 'student-first',
  },
  S137: {
    folderId: '<NEW_FOLDER_ID>',
    layout: 'student-first',
  },
};
```

This fallback is useful if Supabase is unavailable and for local safety.

---

## Step 3 - Restart Locally

```bash
node server.js
```

If another server is already running, stop it first.

---

## Step 4 - Sync Drive Metadata Into Supabase

Run:

```bash
curl -X POST http://localhost:3001/api/sync/class \
  -H "Content-Type: application/json" \
  -d '{"class":"S137"}'
```

Expected response shape:

```json
{
  "success": true,
  "class": "S137",
  "result": {
    "students": 13,
    "days": 17,
    "submissions": 120,
    "submissionFiles": 635
  }
}
```

Counts will vary by class.

---

## Step 5 - Verify

Check days:

```bash
curl "http://localhost:3001/api/days?class=S137"
```

Check submissions:

```bash
curl "http://localhost:3001/api/submissions?class=S137&day=1"
```

Open the app and hard refresh.

The frontend reads `/api/classes`, so a class inserted into Supabase should appear in the sidebar after reload.

---

## Step 6 - Deploy

Commit and push:

```bash
git add src/config/classFolders.js
git commit -m "Add S137 class"
git push
```

Vercel must already have:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CREDENTIALS
```

After deploy, verify:

```text
https://grading-self.vercel.app/api/classes
https://grading-self.vercel.app/api/days?class=S137
https://grading-self.vercel.app/api/submissions?class=S137&day=1
```

---

## Refreshing A Class Later

When new students, days, or submission files are added to Drive, click the reload button on the class pill.

With Supabase configured, that button:

1. Scans Google Drive.
2. Upserts metadata into Supabase.
3. Clears browser day/submission cache for that class.
4. Reloads the day list.

API equivalent:

```bash
curl -X POST http://localhost:3001/api/cache/refresh \
  -H "Content-Type: application/json" \
  -d '{"class":"S137"}'
```

---

## Files Changed Checklist

| File / Place | Change |
|---|---|
| Google Drive | Share class root folder with service account |
| Supabase `classes` table | Insert class ID, folder ID, layout |
| `src/config/classFolders.js` | Add fallback class config |
| Sync API | Run `/api/sync/class` once |

---

## Supabase Schema Reminder

New installs should use the full `supabase-schema.sql`.

Important tables:

- `classes`
- `students`
- `days`
- `submissions`
- `submission_files`

`audio_files` is retained for legacy compatibility, but current sync writes generic file metadata into `submission_files`.
