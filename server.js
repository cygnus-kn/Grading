const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- GOOGLE DRIVE SETUP ---
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEY_FILE = path.join(__dirname, 'credentials.json');

let auth;
let drive = null;

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
  'S001': '1d_JaEf8uEJgLaAlahXkku_HXX9baO7Ss',
  // Add other IDs here when available
};

const DRIVE_RETRY_DELAYS_MS = [500, 1500, 3500];

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

  const dayNumbers = days
    .map(item => Number(item && item.day))
    .filter(Number.isInteger);
  if (dayNumbers.length === 0) return [];

  const maxDay = Math.max(...dayNumbers);
  return Array.from({ length: maxDay }, (_, index) => ({ day: index + 1 }));
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
  return res.data.files;
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

// --- API ROUTES ---

app.get('/api/classes', (req, res) => {
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

// Get all available days for a class — reads from file cache, scans Drive on miss
app.get('/api/days', async (req, res) => {
  const { class: classId } = req.query;
  if (!classId) return res.status(400).json({ error: 'Class parameter required' });

  const rootFolderId = CLASS_FOLDERS[classId];
  if (!rootFolderId) return res.json([]);

  // Return cached result immediately if available
  const cached = readCache(classId);
  if (cached) {
    console.log(`[cache] Serving days for ${classId} from file cache`);
    return res.json(cached);
  }

  // Cache miss — scan Drive
  console.log(`[cache] No cache for ${classId}, scanning Drive...`);
  try {
    const days = await scanDaysFromDrive(rootFolderId);
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

  const results = {};
  for (const id of targets) {
    const rootFolderId = CLASS_FOLDERS[id];
    if (!rootFolderId) continue;
    try {
      console.log(`[cache] Force refreshing ${id}...`);
      const days = await scanDaysFromDrive(rootFolderId);
      writeCache(id, days);
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

app.get('/api/submissions', async (req, res) => {
  const { class: classId, day } = req.query;
  
  if (!day || !classId) {
    return res.status(400).json({ error: 'Class and Day parameters are required' });
  }

  const rootFolderId = CLASS_FOLDERS[classId];
  if (!rootFolderId) {
    console.warn(`No root folder configured for class: ${classId}`);
    return res.json([]);
  }

  try {
    const students = await getStudentFolders(rootFolderId);
    
    // Process students in parallel
    const results = await Promise.all(students.map(async (student) => {
      try {
        const dayFolder = await findDayFolder(student.id, day);
        
        let answers = [];
        if (dayFolder) {
          const files = await getAudioFiles(dayFolder.id);
          answers = files
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
            .map(f => ({
              q: f.name.split('.')[0],
              name: f.name,
              audioUrl: `/api/audio/${f.id}`,
              status: 'pending'
            }));
        }

        return {
          id: student.id,
          name: student.name,
          answers: answers
        };
      } catch (err) {
        console.error(`Error processing student ${student.name}:`, err);
        return { id: student.id, name: student.name, answers: [] };
      }
    }));

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
    console.log(`Connected to Google Drive for S001`);
  });
}

module.exports = app;
