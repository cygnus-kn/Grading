const { drive } = require('../config/googleDrive');
const { matchesDayFolder, normalizeDays, parseDayNumber } = require('../utils/days');

const DRIVE_RETRY_DELAYS_MS = [500, 1500, 3500];

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

function assertDrive() {
  if (!drive) throw new Error('Drive API not initialized');
}

async function getStudentFolders(parentFolderId) {
  assertDrive();
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

async function findDayFolder(studentFolderId, targetDay) {
  assertDrive();
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${studentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  }));

  const folders = res.data.files || [];
  return folders.find(folder => matchesDayFolder(folder.name, targetDay));
}

async function getAudioFiles(folderId) {
  assertDrive();
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
  assertDrive();
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

async function getDayFoldersForStudents(students, targetDay) {
  assertDrive();
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
  assertDrive();
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

async function scanDaysFromDrive(rootFolderId) {
  assertDrive();
  const students = await getStudentFolders(rootFolderId);
  const daySetMap = new Map();

  await Promise.all(students.map(async student => {
    const res = await withDriveRetry(() => drive.files.list({
      q: `'${student.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    }));

    (res.data.files || []).forEach(folder => {
      const day = parseDayNumber(folder.name);
      if (day !== null && !daySetMap.has(day)) {
        daySetMap.set(day, folder.name);
      }
    });
  }));

  return normalizeDays(Array.from(daySetMap.keys()).map(day => ({ day }))) || [];
}

function toAudioAnswers(files) {
  return files
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    .map(file => ({
      q: file.name.split('.')[0],
      name: file.name,
      audioUrl: `/api/audio/${file.id}`,
      status: 'pending',
    }));
}

async function streamAudio(fileId, res) {
  assertDrive();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
  response.data
    .on('end', () => {})
    .on('error', err => {
      console.error('Error streaming audio:', err);
    })
    .pipe(res);
}

module.exports = {
  getAudioFilesForFolders,
  getChildFolders,
  getDayFolders,
  getDayFoldersForStudents,
  getStudentFolders,
  scanDaysFromDrive,
  streamAudio,
  toAudioAnswers,
};
