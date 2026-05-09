require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- GOOGLE DRIVE SETUP ---
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEY_FILE = path.join(__dirname, 'credentials.json');

let auth;
let drive = null;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yaqcrnpbkildloxanrql.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

if (!supabase) {
  console.warn('Supabase is not configured. Falling back to Google Drive live scans.');
}

try {
  if (process.env.GOOGLE_CREDENTIALS) {
    console.log('Using GOOGLE_CREDENTIALS environment variable');
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: SCOPES,
    });
    drive = google.drive({ version: 'v3', auth });
  } else if (fs.existsSync(KEY_FILE)) {
    console.log('Using local credentials.json file');
    auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE,
      scopes: SCOPES,
    });
    drive = google.drive({ version: 'v3', auth });
  } else {
    console.error('CRITICAL: No Google credentials found (env or file). API will fail.');
  }
} catch (err) {
  console.error('Error initializing Google Auth:', err.message);
}

// Map Class IDs to Google Drive Folder IDs
const CLASS_FOLDERS = {
  'S136': {
    folderId: '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r',
    layout: 'student-first',
  },
  // Add other IDs here when available
};

const DRIVE_RETRY_DELAYS_MS = [500, 1500, 3500];
const SUBMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const submissionsMemoryCache = new Map();
const dayFoldersMemoryCache = new Map();

// --- FILE CACHE SETUP ---
const CACHE_DIR = path.join(__dirname, 'cache');
try {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
} catch (e) {
  console.warn('Could not create cache directory (this is normal on Vercel)');
}

function getCachePath(classId) {
  return path.join(CACHE_DIR, `days-${classId}.json`);
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return null;

  const dayNumbers = [...new Set(days
    .map(item => Number(item && item.day))
    .filter(Number.isInteger))]
    .sort((a, b) => b - a);
  if (dayNumbers.length === 0) return [];

  return dayNumbers.map(day => ({ day }));
}

function readCache(classId) {
  const file = getCachePath(classId);
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeDays(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch { return null; }
}

function writeCache(classId, data) {
  try {
    fs.writeFileSync(getCachePath(classId), JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn(`[cache] Failed to write cache for ${classId} (skipping)`);
  }
}

function getSubmissionsCacheKey(classId, day) {
  return `${classId}:${day}`;
}

function readSubmissionsCache(classId, day) {
  const cached = submissionsMemoryCache.get(getSubmissionsCacheKey(classId, day));
  if (!cached) return null;
  if (Date.now() - cached.createdAt > SUBMISSIONS_CACHE_TTL_MS) {
    submissionsMemoryCache.delete(getSubmissionsCacheKey(classId, day));
    return null;
  }
  return cached.data;
}

function writeSubmissionsCache(classId, day, data) {
  submissionsMemoryCache.set(getSubmissionsCacheKey(classId, day), {
    createdAt: Date.now(),
    data,
  });
}

function clearSubmissionsCacheForClass(classId) {
  for (const key of submissionsMemoryCache.keys()) {
    if (key.startsWith(`${classId}:`)) {
      submissionsMemoryCache.delete(key);
    }
  }
}

function readDayFoldersMemoryCache(classId) {
  const cached = dayFoldersMemoryCache.get(classId);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > SUBMISSIONS_CACHE_TTL_MS) {
    dayFoldersMemoryCache.delete(classId);
    return null;
  }
  return cached.data;
}

function writeDayFoldersMemoryCache(classId, data) {
  dayFoldersMemoryCache.set(classId, {
    createdAt: Date.now(),
    data,
  });
}

async function getCachedDayFolders(classId, classConfig) {
  const cached = readDayFoldersMemoryCache(classId);
  if (cached) return cached;

  const dayFolders = await getDayFolders(classConfig.folderId);
  writeDayFoldersMemoryCache(classId, dayFolders);
  return dayFolders;
}

function getClassConfig(classId) {
  const config = CLASS_FOLDERS[classId];
  if (!config) return null;
  if (typeof config === 'string') {
    return { folderId: config, layout: 'student-first' };
  }
  return config;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabase;
}

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

function toQuestionLabel(fileName) {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  const reason = error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason;
  return error?.code === 429 || (
    error?.code === 403 &&
    ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(reason)
  );
}

async function withDriveRetry(operation) {
  for (let attempt = 0; attempt <= DRIVE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === DRIVE_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delay = DRIVE_RETRY_DELAYS_MS[attempt];
      console.warn(`[drive] Rate limit hit; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

// --- HELPER FUNCTIONS ---

/**
 * Lists all student folders in a class folder
 */
async function getStudentFolders(parentFolderId) {
  if (!drive) throw new Error('Drive API not initialized');
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 100,
  }));
  return res.data.files || [];
}

async function getChildFolders(parentFolderId) {
  return getStudentFolders(parentFolderId);
}

/**
 * Finds a specific "Day" folder inside a student folder (fuzzy match)
 */
async function findDayFolder(studentFolderId, targetDay) {
  if (!drive) throw new Error('Drive API not initialized');
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${studentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  }));
  
  const folders = res.data.files || [];
  // Match "day" (or "d" or "ngày") followed by optional leading zeros then the exact number,
  // NOT followed by another digit — so day1 never matches day16.
  const dayPattern = new RegExp(`(?:day|ngày|ngay)0*${targetDay}(?!\\d)`, 'i');
  
  return folders.find(f => {
    const name = f.name.replace(/\s+/g, '');
    return dayPattern.test(name);
  });
}

/**
 * Lists audio files in a folder
 */
async function getAudioFiles(folderId) {
  if (!drive) throw new Error('Drive API not initialized');
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType = 'application/octet-stream') and trashed = false`,
    fields: 'files(id, name, mimeType)',
  }));
  return res.data.files || [];
}

async function getDayFolders(rootFolderId) {
  const folders = await getChildFolders(rootFolderId);
  return folders
    .map(folder => ({ ...folder, day: parseDayNumber(folder.name) }))
    .filter(folder => Number.isInteger(folder.day));
}

async function listDriveFiles(query, fields) {
  const files = [];
  let pageToken;

  do {
    const res = await withDriveRetry(() => drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
    }));

    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return files;
}

function matchesDayFolder(folderName, targetDay) {
  const dayPattern = new RegExp(`(?:day|ngày|ngay)0*${targetDay}(?!\\d)`, 'i');
  const name = String(folderName || '').replace(/\s+/g, '');
  return dayPattern.test(name);
}

async function getDayFoldersForStudents(students, targetDay) {
  if (!drive) throw new Error('Drive API not initialized');
  if (!students.length) return new Map();

  const studentIds = new Set(students.map(student => student.id));
  const folders = await listDriveFiles(
    "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    'id, name, parents'
  );
  const dayFoldersByStudentId = new Map();
  folders.forEach(folder => {
    if (!matchesDayFolder(folder.name, targetDay)) return;
    const studentId = (folder.parents || []).find(parentId => studentIds.has(parentId));
    if (studentId && !dayFoldersByStudentId.has(studentId)) {
      dayFoldersByStudentId.set(studentId, folder);
    }
  });

  if (dayFoldersByStudentId.size === 0) {
    const fallbackFolders = await Promise.all(students.map(async student => {
      const folder = await findDayFolder(student.id, targetDay);
      return folder ? [student.id, folder] : null;
    }));

    fallbackFolders.forEach(entry => {
      if (entry) dayFoldersByStudentId.set(entry[0], entry[1]);
    });
  }

  return dayFoldersByStudentId;
}

async function getAudioFilesForFolders(dayFolders) {
  if (!drive) throw new Error('Drive API not initialized');
  if (!dayFolders.length) return new Map();

  const folderIds = dayFolders.map(folder => folder.id);
  const folderIdSet = new Set(folderIds);
  const files = await listDriveFiles(
    "(mimeType contains 'audio/' or mimeType = 'application/octet-stream') and trashed = false",
    'id, name, mimeType, parents'
  );
  const filesByFolderId = new Map(folderIds.map(folderId => [folderId, []]));
  files.forEach(file => {
    const folderId = (file.parents || []).find(parentId => folderIdSet.has(parentId));
    if (folderId) filesByFolderId.get(folderId).push(file);
  });

  const hasAudioFiles = Array.from(filesByFolderId.values()).some(filesForFolder => filesForFolder.length > 0);
  if (!hasAudioFiles) {
    const fallbackFiles = await Promise.all(dayFolders.map(async folder => {
      const folderFiles = await getAudioFiles(folder.id);
      return [folder.id, folderFiles];
    }));

    fallbackFiles.forEach(([folderId, folderFiles]) => {
      filesByFolderId.set(folderId, folderFiles);
    });
  }

  return filesByFolderId;
}

// --- API ROUTES ---

app.get('/api/classes', (req, res) => {
  if (supabase) {
    getClassesFromSupabase()
      .then(classes => res.json(classes))
      .catch(error => {
        console.error('Supabase classes error; falling back to Drive config:', error);
        const classes = Object.keys(CLASS_FOLDERS).map(id => ({
          id,
          days: readCache(id) || [],
        }));
        res.json(classes);
      });
    return;
  }

  const classes = Object.keys(CLASS_FOLDERS).map(id => ({
    id,
    days: readCache(id) || [],
  }));

  res.json(classes);
});

/**
 * Parses a day number from a folder name.
 * Handles: "Day 16", "Day16", "D16", "Ngày 16", "day 16", "Day016" etc.
 */
function parseDayNumber(folderName) {
  const cleaned = folderName.toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/(?:day|d|ngày|ngay)0*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

async function scanDaysFromDrive(rootFolderId) {
  if (!drive) throw new Error('Drive API not initialized');
  const students = await getStudentFolders(rootFolderId);
  const daySetMap = new Map();

  await Promise.all(students.map(async (student) => {
    const res2 = await withDriveRetry(() => drive.files.list({
      q: `'${student.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    }));
    (res2.data.files || []).forEach(f => {
      const num = parseDayNumber(f.name);
      if (num !== null && !daySetMap.has(num)) {
        daySetMap.set(num, f.name);
      }
    });
  }));

  return normalizeDays(Array.from(daySetMap.keys()).map(day => ({ day }))) || [];
}

async function scanDaysForClass(classId, classConfig) {
  if (classConfig.layout === 'day-first') {
    return normalizeDays(await getCachedDayFolders(classId, classConfig)) || [];
  }

  return scanDaysFromDrive(classConfig.folderId);
}

async function getStudentFirstSubmissions(classConfig, day) {
  const students = await getStudentFolders(classConfig.folderId);
  const dayFoldersByStudentId = await getDayFoldersForStudents(students, day);
  const filesByFolderId = await getAudioFilesForFolders([...dayFoldersByStudentId.values()]);

  return students.map(student => {
    const dayFolder = dayFoldersByStudentId.get(student.id);
    const files = dayFolder ? (filesByFolderId.get(dayFolder.id) || []) : [];
    return {
      id: student.id,
      name: student.name,
      answers: toAudioAnswers(files)
    };
  });
}

async function getDayFirstSubmissions(classId, classConfig, day) {
  const dayFolders = await getCachedDayFolders(classId, classConfig);
  const dayFolder = dayFolders.find(folder => String(folder.day) === String(day));
  if (!dayFolder) return [];

  const students = await getChildFolders(dayFolder.id);
  const filesByFolderId = await getAudioFilesForFolders(students);

  return students.map(student => ({
    id: student.id,
    name: student.name,
    answers: toAudioAnswers(filesByFolderId.get(student.id) || [])
  }));
}

function toAudioAnswers(files) {
  return files
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    .map(f => ({
      q: f.name.split('.')[0],
      name: f.name,
      audioUrl: `/api/audio/${f.id}`,
      status: 'pending'
    }));
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
  const client = requireSupabase();
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

// Get all available days for a class — reads from file cache, scans Drive on miss
app.get('/api/days', async (req, res) => {
  const { class: classId } = req.query;
  if (!classId) return res.status(400).json({ error: 'Class parameter required' });

  if (supabase) {
    try {
      return res.json(await getDaysFromSupabase(classId));
    } catch (error) {
      console.error('Supabase days error; falling back to Drive scan:', error);
    }
  }

  const classConfig = getClassConfig(classId);
  if (!classConfig) return res.json([]);

  // Return cached result immediately if available
  const cached = readCache(classId);
  if (cached) {
    console.log(`[cache] Serving days for ${classId} from file cache`);
    return res.json(cached);
  }

  // Cache miss — scan Drive
  console.log(`[cache] No cache for ${classId}, scanning Drive...`);
  try {
    const days = await scanDaysForClass(classId, classConfig);
    writeCache(classId, days);
    res.json(days);
  } catch (error) {
    console.error('Error fetching days:', error);
    res.status(500).json({ error: 'Failed to fetch days' });
  }
});

// Force re-scan and update cache (call this when new students/days are added)
app.post('/api/cache/refresh', async (req, res) => {
  const classId = req.body ? req.body.class : null;
  const targets = classId ? [classId] : Object.keys(CLASS_FOLDERS);

  if (supabase) {
    const results = {};
    for (const id of targets) {
      try {
        console.log(`[sync] Syncing ${id} from Drive to Supabase...`);
        const result = await syncClassToSupabase(id);
        results[id] = result.days;
      } catch (err) {
        results[id] = `error: ${err.message}`;
      }
    }

    const clearBrowserKeys = targets.map(id => `gradingDays_${id}`);
    return res.json({ refreshed: results, clearBrowserKeys });
  }

  const results = {};
  for (const id of targets) {
    const classConfig = getClassConfig(id);
    if (!classConfig) continue;
    try {
      console.log(`[cache] Force refreshing ${id}...`);
      dayFoldersMemoryCache.delete(id);
      const days = await scanDaysForClass(id, classConfig);
      writeCache(id, days);
      clearSubmissionsCacheForClass(id);
      results[id] = days.length;
    } catch (err) {
      results[id] = `error: ${err.message}`;
    }
  }

  // Include localStorage keys that the browser should clear, 
  // so the next page load fetches the fresh data
  const clearBrowserKeys = targets.map(id => `gradingDays_${id}`);
  res.json({ refreshed: results, clearBrowserKeys });
});

app.post('/api/sync/class', async (req, res) => {
  const classId = req.body ? req.body.class : null;
  if (!classId) return res.status(400).json({ error: 'Class parameter required' });

  try {
    const result = await syncClassToSupabase(classId);
    res.json({
      success: true,
      class: classId,
      result,
      clearBrowserKeys: [`gradingDays_${classId}`],
    });
  } catch (error) {
    console.error('Supabase sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync class' });
  }
});

app.get('/api/submissions', async (req, res) => {
  const { class: classId, day } = req.query;
  
  if (!day || !classId) {
    return res.status(400).json({ error: 'Class and Day parameters are required' });
  }

  if (supabase) {
    try {
      const results = await getSubmissionsFromSupabase(classId, day);
      const audioFileCount = results.reduce((total, student) => total + student.answers.length, 0);
      console.log(`[supabase] ${classId} day ${day}: ${results.length} students, ${audioFileCount} audio files`);
      return res.json(results);
    } catch (error) {
      console.error('Supabase submissions error; falling back to Drive scan:', error);
    }
  }

  const classConfig = getClassConfig(classId);
  if (!classConfig) {
    console.warn(`No root folder configured for class: ${classId}`);
    return res.json([]);
  }

  const cached = readSubmissionsCache(classId, day);
  if (cached) {
    console.log(`[cache] Serving submissions for ${classId} day ${day} from memory cache`);
    return res.json(cached);
  }

  try {
    const results = classConfig.layout === 'day-first'
      ? await getDayFirstSubmissions(classId, classConfig, day)
      : await getStudentFirstSubmissions(classConfig, day);

    const audioFileCount = results.reduce((total, student) => total + student.answers.length, 0);
    console.log(`[submissions] ${classId} day ${day}: ${results.length} students, ${audioFileCount} audio files`);

    writeSubmissionsCache(classId, day, results);
    res.json(results);
  } catch (error) {
    console.error('Drive API Error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Google Drive' });
  }
});

// Proxy route to stream audio from Google Drive
app.get('/api/audio/:fileId', async (req, res) => {
  if (!drive) return res.status(500).send('Drive API not initialized');
  try {
    const fileId = req.params.fileId;
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    response.data
      .on('end', () => {})
      .on('error', err => {
        console.error('Error streaming audio:', err);
      })
      .pipe(res);
  } catch (error) {
    console.error('Audio Proxy Error:', error);
    res.status(500).send('Error fetching audio');
  }
});

// Submit feedback (remains mock for now)
app.post('/api/feedback', (req, res) => {
  const { studentId, day, question, comment } = req.body;
  console.log(`Feedback received: Student ${studentId}, Day ${day}, Q: ${question}, Comment: ${comment}`);
  
  setTimeout(() => {
    res.json({ success: true, message: 'Comment pushed to Google Sheet (Simulated)' });
  }, 800);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Connected to Google Drive for S136`);
  });
}

module.exports = app;
