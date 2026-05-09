create table if not exists classes (
  id text primary key,
  drive_folder_id text not null,
  layout text not null default 'student-first',
  last_synced_at timestamptz
);

create table if not exists students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  drive_folder_id text not null,
  name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists days (
  id bigserial primary key,
  class_id text not null references classes(id) on delete cascade,
  day_number integer not null,
  drive_folder_id text,
  updated_at timestamptz not null default now(),
  unique (class_id, day_number)
);

create table if not exists submissions (
  id bigserial primary key,
  class_id text not null references classes(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  day_number integer not null,
  drive_folder_id text,
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, day_number)
);

create table if not exists audio_files (
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

create index if not exists idx_days_class_day on days(class_id, day_number desc);
create index if not exists idx_submissions_class_day on submissions(class_id, day_number);
create index if not exists idx_audio_files_submission on audio_files(submission_id);
create index if not exists idx_audio_files_class_day on audio_files(class_id, day_number);

insert into classes (id, drive_folder_id, layout)
values ('S136', '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r', 'student-first')
on conflict (id) do update set
  drive_folder_id = excluded.drive_folder_id,
  layout = excluded.layout;
