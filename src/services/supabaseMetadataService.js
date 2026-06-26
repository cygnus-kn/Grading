const { getClassConfig } = require('../config/classFolders');
const { requireSupabase, supabase } = require('../config/supabase');
const { toQuestionLabel, parseDayNumber } = require('../utils/days');
const {
  getChangesStartPageToken,
  getChangesSince,
  getChildFolders,
  getDayFoldersForStudents,
  getSubmissionFilesForFolders,
  getStudentFolders,
  toSubmissionItem,
} = require('./driveService');
const { clearSubmissionsCacheForClass } = require('./cacheService');

const DELETE_BATCH_SIZE = 500;

async function getSupabaseClassConfig(classId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('classes')
    .select('id, drive_folder_id, layout')
    .eq('id', classId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    folderId: data.drive_folder_id,
    layout: data.layout || 'student-first',
  };
}

async function getClassConfigForSync(classId) {
  const dbConfig = await getSupabaseClassConfig(classId);
  const fallbackConfig = getClassConfig(classId);
  if (dbConfig) {
    return { ...(fallbackConfig || {}), ...dbConfig };
  }
  return fallbackConfig;
}

async function upsertRows(table, rows, options = {}) {
  if (!rows.length) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from(table)
    .upsert(rows, options)
    .select();

  if (error) throw error;
  return data || [];
}

async function deleteClassRowsByIds(client, table, classId, idColumn, ids) {
  const uniqueIds = [...new Set(ids)].filter(id => id !== null && id !== undefined);
  if (uniqueIds.length === 0) return 0;

  for (let i = 0; i < uniqueIds.length; i += DELETE_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await client
      .from(table)
      .delete()
      .eq('class_id', classId)
      .in(idColumn, batch);

    if (error) throw error;
  }

  return uniqueIds.length;
}

async function getClassRows(client, table, columns, classId) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq('class_id', classId);

  if (error) throw error;
  return data || [];
}

async function pruneClassRows(client, table, columns, classId, isCurrent, idColumn = 'id') {
  const existingRows = await getClassRows(client, table, columns, classId);
  const staleIds = existingRows
    .filter(row => !isCurrent(row))
    .map(row => row[idColumn]);

  return deleteClassRowsByIds(client, table, classId, idColumn, staleIds);
}

async function getClassDayRows(client, table, columns, classId, dayNumber) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq('class_id', classId)
    .eq('day_number', dayNumber);

  if (error) throw error;
  return data || [];
}

async function pruneClassDayRows(client, table, columns, classId, dayNumber, isCurrent, idColumn = 'id') {
  const existingRows = await getClassDayRows(client, table, columns, classId, dayNumber);
  const staleIds = existingRows
    .filter(row => !isCurrent(row))
    .map(row => row[idColumn]);

  return deleteClassRowsByIds(client, table, classId, idColumn, staleIds);
}

async function getSyncPageToken() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('sync_state')
    .select('value')
    .eq('key', 'drive_page_token')
    .maybeSingle();

  if (error) throw error;
  return data?.value || null;
}

async function setSyncPageToken(token) {
  const client = requireSupabase();
  const { error } = await client
    .from('sync_state')
    .upsert({
      key: 'drive_page_token',
      value: token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (error) throw error;
}

function mapChangesToClassIds(changes, classRows, studentRows, submissionRows) {
  const folderToClass = new Map();

  // Map root class folders
  for (const row of classRows || []) {
    if (row.drive_folder_id) folderToClass.set(row.drive_folder_id, row.id);
  }
  // Map student folders
  for (const row of studentRows || []) {
    if (row.drive_folder_id) folderToClass.set(row.drive_folder_id, row.class_id);
    // Also map the student's id as a folder id (student.id IS the drive folder id)
    if (row.id) folderToClass.set(row.id, row.class_id);
  }
  // Map submission (day) folders
  for (const row of submissionRows || []) {
    if (row.drive_folder_id) folderToClass.set(row.drive_folder_id, row.class_id);
  }

  const changedClassIds = new Set();

  for (const change of changes) {
    const file = change.file;
    if (!file) {
      // File was removed but no file metadata — conservatively mark all
      if (change.removed) {
        return { allClasses: true };
      }
      continue;
    }

    // Check the file itself (e.g. if it's a known folder)
    if (folderToClass.has(file.id)) {
      changedClassIds.add(folderToClass.get(file.id));
      continue;
    }

    // Check its parent
    const parentId = (file.parents || [])[0];
    if (parentId && folderToClass.has(parentId)) {
      changedClassIds.add(folderToClass.get(parentId));
      continue;
    }
  }

  return { changedClassIds };
}

async function detectChangedClassIds() {
  const client = requireSupabase();
  const pageToken = await getSyncPageToken();

  // First time: no token stored — need a full sync to establish baseline
  if (!pageToken) {
    const initialToken = await getChangesStartPageToken();
    console.log('[changes] No page token stored — first run, marking all classes for full sync');
    return { allClasses: true, newToken: initialToken };
  }

  const { changes, newStartPageToken } = await getChangesSince(pageToken);
  console.log(`[changes] Fetched ${changes.length} change(s) from Drive`);

  if (changes.length === 0) {
    return { changedClassIds: new Set(), newToken: newStartPageToken };
  }

  // Build a lookup of known Drive folder IDs → class IDs
  // from students table (student folder → class) and classes table (root folder → class)
  const { data: classRows } = await client
    .from('classes')
    .select('id, drive_folder_id');

  const { data: studentRows } = await client
    .from('students')
    .select('id, class_id, drive_folder_id');

  const { data: submissionRows } = await client
    .from('submissions')
    .select('drive_folder_id, class_id');

  const mappingResult = mapChangesToClassIds(changes, classRows, studentRows, submissionRows);

  if (mappingResult.allClasses) {
    console.log(`[changes] Removed file with no metadata — marking all classes`);
    return { allClasses: true, newToken: newStartPageToken };
  }

  console.log(`[changes] Detected changes in ${mappingResult.changedClassIds.size} class(es): ${[...mappingResult.changedClassIds].join(', ') || '(none)'}`);
  return { changedClassIds: mappingResult.changedClassIds, newToken: newStartPageToken };
}

async function getClassesFromSupabase() {
  const client = requireSupabase();
  const { data: classes, error } = await client
    .from('classes')
    .select('id, last_synced_at')
    .order('id', { ascending: true });

  if (error) throw error;

  const result = [];
  for (const classInfo of classes || []) {
    const days = await getDaysFromSupabase(classInfo.id);
    result.push({
      id: classInfo.id,
      days,
      lastSyncedAt: classInfo.last_synced_at || null,
    });
  }

  return result;
}

async function getClassIdsFromSupabase() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('classes')
    .select('id')
    .order('id', { ascending: true });

  if (error) throw error;
  return (data || []).map(row => row.id);
}

async function getDaysFromSupabase(classId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('days')
    .select('day_number')
    .eq('class_id', classId)
    .order('day_number', { ascending: false });

  if (error) throw error;
  return (data || []).map(row => ({ day: row.day_number }));
}

async function getSubmissionFileRows(client, submissionIds) {
  if (submissionIds.length === 0) return [];

  const { data, error } = await client
    .from('submission_files')
    .select('submission_id, drive_file_id, parent_folder_id, file_name, question_label, file_kind, mime_type, web_view_link, thumbnail_link')
    .in('submission_id', submissionIds)
    .order('file_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getCommentsForClassDay(classId, dayNumber) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('comments')
    .select('student_id, question_label, comment, updated_at')
    .eq('class_id', classId)
    .eq('day_number', dayNumber);

  if (error) throw error;

  const commentMap = new Map();
  (data || []).forEach(row => {
    commentMap.set(`${row.student_id}:${row.question_label}`, row.comment);
  });
  return commentMap;
}

async function upsertComment(classId, studentId, dayNumber, questionLabel, comment) {
  const client = requireSupabase();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from('comments')
    .upsert({
      class_id: classId,
      student_id: studentId,
      day_number: dayNumber,
      question_label: questionLabel,
      comment: comment,
      updated_at: now,
    }, { onConflict: 'class_id,student_id,day_number,question_label' })
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

async function getSubmissionsFromSupabase(classId, day) {
  const client = requireSupabase();
  const dayNumber = Number(day);

  const { data: students, error: studentsError } = await client
    .from('students')
    .select('id, name')
    .eq('class_id', classId)
    .order('name', { ascending: true });

  if (studentsError) throw studentsError;
  if (!students || students.length === 0) return [];

  const { data: submissions, error: submissionsError } = await client
    .from('submissions')
    .select('id, student_id')
    .eq('class_id', classId)
    .eq('day_number', dayNumber);

  if (submissionsError) throw submissionsError;

  const submissionIds = (submissions || []).map(submission => submission.id);
  const submissionIdByStudentId = new Map((submissions || []).map(submission => [
    submission.student_id,
    submission.id,
  ]));

  const submissionFiles = await getSubmissionFileRows(client, submissionIds);

  const submissionFilesBySubmissionId = new Map();
  submissionFiles.forEach(file => {
    const files = submissionFilesBySubmissionId.get(file.submission_id) || [];
    files.push(toSubmissionItem(file));
    submissionFilesBySubmissionId.set(file.submission_id, files);
  });

  // Fetch comments for this class+day
  let commentMap = new Map();
  try {
    commentMap = await getCommentsForClassDay(classId, dayNumber);
  } catch (err) {
    console.error('[comments] Failed to load comments, continuing without:', err.message);
  }

  return students.map(student => {
    const submissionId = submissionIdByStudentId.get(student.id);
    const files = submissionId ? (submissionFilesBySubmissionId.get(submissionId) || []) : [];

    // Attach comments to each file
    const filesWithComments = files.map(file => {
      const key = `${student.id}:${file.q || file.name || ''}`;
      const comment = commentMap.get(key);
      return comment !== undefined ? { ...file, comment } : file;
    });

    return {
      id: student.id,
      name: student.name,
      answers: filesWithComments,
      submissionFiles: filesWithComments,
    };
  });
}

async function getDayFoldersForSync(students) {
  const entries = await Promise.all(students.map(async student => {
    const folders = await getChildFolders(student.id);
    return folders
      .map(folder => ({ ...folder, studentId: student.id, day: parseDayNumber(folder.name) }))
      .filter(folder => Number.isInteger(folder.day));
  }));

  return entries.flat();
}

async function syncStudentFirstClass(classId, classConfig) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const students = await getStudentFolders(classConfig);
  const dayFolders = await getDayFoldersForSync(students);
  const filesByFolderId = await getSubmissionFilesForFolders(dayFolders);
  const currentStudentIds = new Set(students.map(student => student.id));

  await upsertRows('students', students.map(student => ({
    id: student.id,
    class_id: classId,
    drive_folder_id: student.id,
    name: student.name,
    updated_at: now,
  })), { onConflict: 'id' });

  const uniqueDayNumbers = [...new Set(dayFolders.map(folder => folder.day))]
    .sort((a, b) => b - a);
  const currentDayNumbers = new Set(uniqueDayNumbers);

  await upsertRows('days', uniqueDayNumbers.map(dayNumber => ({
    class_id: classId,
    day_number: dayNumber,
    updated_at: now,
  })), { onConflict: 'class_id,day_number' });

  // Deduplicate by (student_id, day_number) — when a student has multiple
  // folders that parse to the same day (e.g. "Day 18.05.26" and "Day 18_11.05.26"),
  // keep only the last one to avoid Postgres "cannot affect row a second time" error.
  const submissionRowsByKey = new Map();
  dayFolders.forEach(folder => {
    const key = `${folder.studentId}:${folder.day}`;
    submissionRowsByKey.set(key, {
      class_id: classId,
      student_id: folder.studentId,
      day_number: folder.day,
      drive_folder_id: folder.id,
      updated_at: now,
    });
  });
  const submissionRows = [...submissionRowsByKey.values()];

  const syncedSubmissions = await upsertRows('submissions', submissionRows, {
    onConflict: 'class_id,student_id,day_number',
  });

  const submissionIdByKey = new Map(syncedSubmissions.map(submission => [
    `${submission.student_id}:${submission.day_number}`,
    submission.id,
  ]));

  const submissionFileRowsById = new Map();
  dayFolders.forEach(folder => {
    const submissionId = submissionIdByKey.get(`${folder.studentId}:${folder.day}`);
    if (!submissionId) return;

    const files = filesByFolderId.get(folder.id) || [];
    files.forEach(file => {
      if (submissionFileRowsById.has(file.id)) return;
      const submissionItem = toSubmissionItem(file);
      submissionFileRowsById.set(file.id, {
        id: file.id,
        submission_id: submissionId,
        class_id: classId,
        student_id: folder.studentId,
        day_number: folder.day,
        drive_file_id: file.id,
        parent_folder_id: file.parents?.[0] || folder.id,
        file_name: file.name,
        question_label: toQuestionLabel(file.name),
        file_kind: submissionItem.kind,
        mime_type: file.mimeType || null,
        web_view_link: file.webViewLink || null,
        thumbnail_link: file.thumbnailLink || null,
        updated_at: now,
      });
    });
  });
  const submissionFileRows = [...submissionFileRowsById.values()];
  const currentSubmissionFileIds = new Set(submissionFileRows.map(file => file.id));

  await upsertRows('submission_files', submissionFileRows, { onConflict: 'id' });

  const currentSubmissionKeys = new Set(submissionRows.map(submission => (
    `${submission.student_id}:${submission.day_number}`
  )));

  const deletedStudents = await pruneClassRows(
    client,
    'students',
    'id',
    classId,
    row => currentStudentIds.has(row.id)
  );
  const deletedDays = await pruneClassRows(
    client,
    'days',
    'id, day_number',
    classId,
    row => currentDayNumbers.has(row.day_number)
  );
  const deletedSubmissions = await pruneClassRows(
    client,
    'submissions',
    'id, student_id, day_number',
    classId,
    row => currentSubmissionKeys.has(`${row.student_id}:${row.day_number}`)
  );
  const deletedSubmissionFiles = await pruneClassRows(
    client,
    'submission_files',
    'id',
    classId,
    row => currentSubmissionFileIds.has(row.id)
  );

  const { error } = await client
    .from('classes')
    .update({ last_synced_at: now })
    .eq('id', classId);

  if (error) throw error;

  return {
    students: students.length,
    days: uniqueDayNumbers.length,
    submissions: syncedSubmissions.length,
    submissionFiles: submissionFileRows.length,
    deletedStudents,
    deletedDays,
    deletedSubmissions,
    deletedSubmissionFiles,
  };
}

async function syncStudentFirstClassDay(classId, classConfig, day) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw new Error(`Invalid day for sync: ${day}`);
  }

  const students = await getStudentFolders(classConfig);
  const dayFoldersByStudentId = await getDayFoldersForStudents(students, dayNumber);
  const dayFolders = [...dayFoldersByStudentId.entries()].map(([studentId, folder]) => ({
    ...folder,
    studentId,
    day: dayNumber,
  }));
  const filesByFolderId = await getSubmissionFilesForFolders(dayFolders);

  await upsertRows('students', students.map(student => ({
    id: student.id,
    class_id: classId,
    drive_folder_id: student.id,
    name: student.name,
    updated_at: now,
  })), { onConflict: 'id' });

  if (dayFolders.length > 0) {
    await upsertRows('days', [{
      class_id: classId,
      day_number: dayNumber,
      updated_at: now,
    }], { onConflict: 'class_id,day_number' });
  }

  const submissionRows = dayFolders.map(folder => ({
    class_id: classId,
    student_id: folder.studentId,
    day_number: dayNumber,
    drive_folder_id: folder.id,
    updated_at: now,
  }));

  const syncedSubmissions = await upsertRows('submissions', submissionRows, {
    onConflict: 'class_id,student_id,day_number',
  });

  const submissionIdByKey = new Map(syncedSubmissions.map(submission => [
    `${submission.student_id}:${submission.day_number}`,
    submission.id,
  ]));

  const submissionFileRowsById = new Map();
  dayFolders.forEach(folder => {
    const submissionId = submissionIdByKey.get(`${folder.studentId}:${dayNumber}`);
    if (!submissionId) return;

    const files = filesByFolderId.get(folder.id) || [];
    files.forEach(file => {
      if (submissionFileRowsById.has(file.id)) return;
      const submissionItem = toSubmissionItem(file);
      submissionFileRowsById.set(file.id, {
        id: file.id,
        submission_id: submissionId,
        class_id: classId,
        student_id: folder.studentId,
        day_number: dayNumber,
        drive_file_id: file.id,
        parent_folder_id: file.parents?.[0] || folder.id,
        file_name: file.name,
        question_label: toQuestionLabel(file.name),
        file_kind: submissionItem.kind,
        mime_type: file.mimeType || null,
        web_view_link: file.webViewLink || null,
        thumbnail_link: file.thumbnailLink || null,
        updated_at: now,
      });
    });
  });

  const submissionFileRows = [...submissionFileRowsById.values()];
  const currentSubmissionKeys = new Set(submissionRows.map(submission => (
    `${submission.student_id}:${submission.day_number}`
  )));
  const currentSubmissionFileIds = new Set(submissionFileRows.map(file => file.id));

  await upsertRows('submission_files', submissionFileRows, { onConflict: 'id' });

  const deletedSubmissionFiles = await pruneClassDayRows(
    client,
    'submission_files',
    'id',
    classId,
    dayNumber,
    row => currentSubmissionFileIds.has(row.id)
  );
  const deletedSubmissions = await pruneClassDayRows(
    client,
    'submissions',
    'id, student_id, day_number',
    classId,
    dayNumber,
    row => currentSubmissionKeys.has(`${row.student_id}:${row.day_number}`)
  );

  let deletedDays = 0;
  if (dayFolders.length === 0) {
    const { data: deletedDayRows, error } = await client
      .from('days')
      .delete()
      .eq('class_id', classId)
      .eq('day_number', dayNumber)
      .select('id');

    if (error) throw error;
    deletedDays = deletedDayRows?.length || 0;
  }

  const { error } = await client
    .from('classes')
    .update({ last_synced_at: now })
    .eq('id', classId);

  if (error) throw error;

  clearSubmissionsCacheForClass(classId);

  return {
    students: students.length,
    days: dayFolders.length > 0 ? 1 : 0,
    submissions: syncedSubmissions.length,
    submissionFiles: submissionFileRows.length,
    deletedDays,
    deletedSubmissions,
    deletedSubmissionFiles,
  };
}

async function syncClassToSupabase(classId) {
  const classConfig = await getClassConfigForSync(classId);
  if (!classConfig) throw new Error(`No class configured for ${classId}`);

  await upsertRows('classes', [{
    id: classId,
    drive_folder_id: classConfig.folderId,
    layout: classConfig.layout || 'student-first',
  }], { onConflict: 'id' });

  if ((classConfig.layout || 'student-first') !== 'student-first') {
    throw new Error(`Supabase sync currently supports student-first classes only (${classId})`);
  }

  const result = await syncStudentFirstClass(classId, classConfig);
  clearSubmissionsCacheForClass(classId);
  return result;
}

async function syncClassDayToSupabase(classId, day) {
  const classConfig = await getClassConfigForSync(classId);
  if (!classConfig) throw new Error(`No class configured for ${classId}`);

  await upsertRows('classes', [{
    id: classId,
    drive_folder_id: classConfig.folderId,
    layout: classConfig.layout || 'student-first',
  }], { onConflict: 'id' });

  if ((classConfig.layout || 'student-first') !== 'student-first') {
    throw new Error(`Day sync currently supports student-first classes only (${classId})`);
  }

  return syncStudentFirstClassDay(classId, classConfig, day);
}

module.exports = {
  detectChangedClassIds,
  getClassIdsFromSupabase,
  getClassesFromSupabase,
  getCommentsForClassDay,
  getDaysFromSupabase,
  getSubmissionsFromSupabase,
  getSyncPageToken,
  mapChangesToClassIds,
  setSyncPageToken,
  syncClassDayToSupabase,
  syncClassToSupabase,
  upsertComment,
};
