# Supabase Metadata Cache Guide

This guide explains how to make the grading app load class/day pages quickly by caching Google Drive metadata in Supabase Postgres.

The audio files stay in Google Drive. Supabase stores only the metadata needed to render the table quickly: classes, students, days, folder IDs, file IDs, file names, and question labels.

## Goal

Current slow path:

```text
Browser -> Express -> Google Drive scan -> render table
```

Target fast path:

```text
Browser -> Express -> Supabase Postgres -> render table
```

Google Drive should only be scanned when you refresh/sync data.

## Recommended Service

Use **Supabase Postgres**.

Reasons:

- It is real Postgres.
- It has a dashboard table editor, which makes debugging synced classes/students/files easy.
- It works well for this app's relational data.
- It can later support auth, storage, or scheduled functions if needed.

Keep audio in Google Drive for now. Do not use Supabase Storage unless you later want to copy the actual audio files out of Drive.

## Data Model

Create these tables in Supabase.

```sql
create table classes (
  id text primary key,
  drive_folder_id text not null,
  layout text not null default 'student-first',
  last_synced_at timestamptz
);

create table students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  drive_folder_id text not null,
  name text not null,
  updated_at timestamptz not null default now()
);

create table days (
  id bigserial primary key,
  class_id text not null references classes(id) on delete cascade,
  day_number integer not null,
  drive_folder_id text,
  updated_at timestamptz not null default now(),
  unique (class_id, day_number)
);

create table submissions (
  id bigserial primary key,
  class_id text not null references classes(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  day_number integer not null,
  drive_folder_id text,
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, day_number)
);

create table audio_files (
  id text primary key,
  submission_id bigint not null references submissions(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  day_number integer not null,
  drive_file_id text not null unique,
  file_name text not null,
  question_label text not null,
  mime_type text,
  updated_at timestamptz not null default now()
);

create index idx_days_class_day on days(class_id, day_number desc);
create index idx_submissions_class_day on submissions(class_id, day_number);
create index idx_audio_files_submission on audio_files(submission_id);
create index idx_audio_files_class_day on audio_files(class_id, day_number);
```

Insert the current class:

```sql
insert into classes (id, drive_folder_id, layout)
values ('S136', '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r', 'student-first')
on conflict (id) do update set
  drive_folder_id = excluded.drive_folder_id,
  layout = excluded.layout;
```

## Environment Variables

In Supabase, create a project and copy:

- Project URL
- Service role key

Add these to `.env` locally and to your deployed environment:

```text
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Important: use the service role key only on the server. Never expose it in `public/app.js`.

## Install Dependency

```bash
npm install @supabase/supabase-js
```

## Server Setup

In `server.js`, initialize Supabase near the top:

```js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app should still start, but sync/database routes should return a clear error.

## New Request Flow

### `/api/classes`

Read from Supabase `classes`, not from `CLASS_FOLDERS`.

Return:

```js
[
  {
    id: 'S136',
    days: [...]
  }
]
```

### `/api/days?class=S136`

Read from Supabase:

```sql
select day_number
from days
where class_id = 'S136'
order by day_number desc;
```

Return:

```js
[
  { "day": 17 },
  { "day": 16 }
]
```

### `/api/submissions?class=S136&day=17`

Read from Supabase instead of scanning Drive.

Suggested query shape:

```sql
select
  s.id,
  s.name,
  af.file_name,
  af.question_label,
  af.drive_file_id
from students s
left join submissions sub
  on sub.student_id = s.id
  and sub.class_id = s.class_id
  and sub.day_number = 17
left join audio_files af
  on af.submission_id = sub.id
where s.class_id = 'S136'
order by s.name asc, af.file_name asc;
```

Then group rows into the current frontend shape:

```js
[
  {
    id: studentId,
    name: studentName,
    answers: [
      {
        q: questionLabel,
        name: fileName,
        audioUrl: `/api/audio/${driveFileId}`,
        status: 'pending'
      }
    ]
  }
]
```

The browser can keep doing frontend alphabetical sorting as a final display pass.

## Sync Flow

Add a backend route:

```text
POST /api/sync/class
body: { "class": "S136" }
```

This route should:

1. Read class config from Supabase `classes`.
2. Scan Google Drive once.
3. Upsert students into `students`.
4. Upsert days into `days`.
5. Upsert submissions into `submissions`.
6. Upsert audio files into `audio_files`.
7. Update `classes.last_synced_at`.

Use `upsert` so running sync repeatedly is safe.

## Sync Logic For Student-First Layout

For `S136`, expected Drive structure:

```text
Class folder
  Student folder
    Day 17 folder
      audio files
```

Algorithm:

```text
1. List student folders under class root folder.
2. For each student:
   - upsert student row
   - list day folders inside student folder
   - parse day number from folder name
   - upsert day row
   - upsert submission row
   - list audio files inside that day folder
   - upsert audio file rows
```

This can be slower, but it happens only when syncing, not when opening a day.

## Existing Audio Route Can Stay

Keep this route:

```text
GET /api/audio/:fileId
```

It still streams from Google Drive:

```js
drive.files.get(
  { fileId, alt: 'media' },
  { responseType: 'stream' }
)
```

This means:

- Page/table load becomes fast.
- Audio playback still streams from Drive when clicked.
- You avoid duplicating audio files.

## Refresh Button Behavior

Change the class pill reload button to call the new sync route:

```text
POST /api/sync/class
```

After sync finishes:

1. Clear browser day cache for that class.
2. Clear browser submission cache for that class/day if you keep localStorage caching.
3. Reload `/api/days`.
4. Reload current selected day if needed.

## Recommended Implementation Order

1. Create Supabase project.
2. Run the SQL schema above.
3. Add `.env` variables.
4. Install `@supabase/supabase-js`.
5. Add Supabase client to `server.js`.
6. Build `POST /api/sync/class`.
7. Run one sync for `S136`.
8. Change `/api/days` to read Supabase.
9. Change `/api/submissions` to read Supabase.
10. Keep `/api/audio/:fileId` unchanged.
11. Change the frontend refresh button to call sync.

## Expected Performance

Before:

```text
Click day -> scan Google Drive -> wait several seconds
```

After:

```text
Click day -> query Supabase metadata -> render quickly
```

The only remaining delay is when pressing play on an audio file, because that still streams from Google Drive.

## Later Improvements

Optional later upgrades:

- Add a scheduled sync every night.
- Add a "last synced" timestamp in the sidebar.
- Add per-class sync status.
- Store feedback comments in Supabase.
- Move audio files to Supabase Storage or S3/R2 only if Drive playback itself becomes too slow.
