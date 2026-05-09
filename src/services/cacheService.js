const fs = require('fs');
const path = require('path');
const { normalizeDays } = require('../utils/days');

const SUBMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');

const submissionsMemoryCache = new Map();
const dayFoldersMemoryCache = new Map();

try {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
} catch (e) {
  console.warn('Could not create cache directory (this is normal on Vercel)');
}

function getCachePath(classId) {
  return path.join(CACHE_DIR, `days-${classId}.json`);
}

function readDaysFileCache(classId) {
  const file = getCachePath(classId);
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeDays(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function writeDaysFileCache(classId, data) {
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
  const key = getSubmissionsCacheKey(classId, day);
  const cached = submissionsMemoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > SUBMISSIONS_CACHE_TTL_MS) {
    submissionsMemoryCache.delete(key);
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

function clearDayFoldersMemoryCache(classId) {
  dayFoldersMemoryCache.delete(classId);
}

module.exports = {
  clearDayFoldersMemoryCache,
  clearSubmissionsCacheForClass,
  readDayFoldersMemoryCache,
  readDaysFileCache,
  readSubmissionsCache,
  writeDayFoldersMemoryCache,
  writeDaysFileCache,
  writeSubmissionsCache,
};
