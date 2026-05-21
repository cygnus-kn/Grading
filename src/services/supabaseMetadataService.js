const { getClassConfig } = require('../config/classFolders');
const { requireSupabase, supabase } = require('../config/supabase');
const { toQuestionLabel, parseDayNumber } = require('../utils/days');
const {
  getChildFolders,
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
  if (dbConfig) return dbConfig;
  return getClassConfig(classId);
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

  return students.map(student => {
    const submissionId = submissionIdByStudentId.get(student.id);
    const files = submissionId ? (submissionFilesBySubmissionId.get(submissionId) || []) : [];
    return {
      id: student.id,
      name: student.name,
      answers: files,
      submissionFiles: files,
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
  const students = await getStudentFolders(classConfig.folderId);
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

module.exports = {
  getClassIdsFromSupabase,
  getClassesFromSupabase,
  getDaysFromSupabase,
  getSubmissionsFromSupabase,
  syncClassToSupabase,
};
