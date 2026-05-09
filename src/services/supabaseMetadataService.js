const { getClassConfig } = require('../config/classFolders');
const { requireSupabase, supabase } = require('../config/supabase');
const { toQuestionLabel, parseDayNumber } = require('../utils/days');
const {
  getAudioFilesForFolders,
  getChildFolders,
  getStudentFolders,
} = require('./driveService');
const { clearSubmissionsCacheForClass } = require('./cacheService');

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

async function getClassesFromSupabase() {
  const client = requireSupabase();
  const { data: classes, error } = await client
    .from('classes')
    .select('id')
    .order('id', { ascending: true });

  if (error) throw error;

  const result = [];
  for (const classInfo of classes || []) {
    const days = await getDaysFromSupabase(classInfo.id);
    result.push({ id: classInfo.id, days });
  }

  return result;
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

  let audioFiles = [];
  if (submissionIds.length > 0) {
    const { data, error } = await client
      .from('audio_files')
      .select('submission_id, drive_file_id, file_name, question_label')
      .in('submission_id', submissionIds)
      .order('file_name', { ascending: true });

    if (error) throw error;
    audioFiles = data || [];
  }

  const audioFilesBySubmissionId = new Map();
  audioFiles.forEach(file => {
    const files = audioFilesBySubmissionId.get(file.submission_id) || [];
    files.push({
      q: file.question_label,
      name: file.file_name,
      audioUrl: `/api/audio/${file.drive_file_id}`,
      status: 'pending',
    });
    audioFilesBySubmissionId.set(file.submission_id, files);
  });

  return students.map(student => {
    const submissionId = submissionIdByStudentId.get(student.id);
    return {
      id: student.id,
      name: student.name,
      answers: submissionId ? (audioFilesBySubmissionId.get(submissionId) || []) : [],
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
  const filesByFolderId = await getAudioFilesForFolders(dayFolders);

  await upsertRows('students', students.map(student => ({
    id: student.id,
    class_id: classId,
    drive_folder_id: student.id,
    name: student.name,
    updated_at: now,
  })), { onConflict: 'id' });

  const uniqueDayNumbers = [...new Set(dayFolders.map(folder => folder.day))]
    .sort((a, b) => b - a);

  await upsertRows('days', uniqueDayNumbers.map(dayNumber => ({
    class_id: classId,
    day_number: dayNumber,
    updated_at: now,
  })), { onConflict: 'class_id,day_number' });

  const submissionRows = dayFolders.map(folder => ({
    class_id: classId,
    student_id: folder.studentId,
    day_number: folder.day,
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

  const audioRows = [];
  dayFolders.forEach(folder => {
    const submissionId = submissionIdByKey.get(`${folder.studentId}:${folder.day}`);
    if (!submissionId) return;

    const files = filesByFolderId.get(folder.id) || [];
    files.forEach(file => {
      audioRows.push({
        id: file.id,
        submission_id: submissionId,
        class_id: classId,
        student_id: folder.studentId,
        day_number: folder.day,
        drive_file_id: file.id,
        file_name: file.name,
        question_label: toQuestionLabel(file.name),
        mime_type: file.mimeType || null,
        updated_at: now,
      });
    });
  });

  await upsertRows('audio_files', audioRows, { onConflict: 'id' });

  const { error } = await client
    .from('classes')
    .update({ last_synced_at: now })
    .eq('id', classId);

  if (error) throw error;

  return {
    students: students.length,
    days: uniqueDayNumbers.length,
    submissions: syncedSubmissions.length,
    audioFiles: audioRows.length,
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
  getClassesFromSupabase,
  getDaysFromSupabase,
  getSubmissionsFromSupabase,
  syncClassToSupabase,
};
