const { drive } = require('../config/googleDrive');
const { matchesDayFolder, normalizeDays, parseDayNumber } = require('../utils/days');

const DRIVE_RETRY_DELAYS_MS = [500, 1500, 3500];
const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const GOOGLE_DRIVE_FILE_BASE_URL = 'https://drive.google.com/file/d';
const AUDIO_EXTENSIONS = new Set(['.aac', '.aif', '.aiff', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav', '.webm', '.wma']);
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.gdoc', '.odt', '.pdf', '.rtf', '.txt']);
const DOCUMENT_MIME_TYPES = new Set([
  GOOGLE_DOC_MIME_TYPE,
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

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

async function getChangesStartPageToken() {
  assertDrive();
  const res = await withDriveRetry(() => drive.changes.getStartPageToken({}));
  return res.data.startPageToken;
}

async function getChangesSince(pageToken) {
  assertDrive();
  const changes = [];
  let currentToken = pageToken;

  do {
    const res = await withDriveRetry(() => drive.changes.list({
      pageToken: currentToken,
      fields: 'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, parents, trashed))',
      pageSize: 1000,
      includeRemoved: true,
      spaces: 'drive',
    }));

    changes.push(...(res.data.changes || []));

    if (res.data.newStartPageToken) {
      return { changes, newStartPageToken: res.data.newStartPageToken };
    }
    currentToken = res.data.nextPageToken;
  } while (currentToken);

  return { changes, newStartPageToken: currentToken };
}

async function getStudentFolders(classConfigOrFolderId) {
  assertDrive();
  const parentFolderId = typeof classConfigOrFolderId === 'string' ? classConfigOrFolderId : classConfigOrFolderId.folderId;
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 100,
  }));
  let students = res.data.files || [];
  
  if (typeof classConfigOrFolderId === 'object' && classConfigOrFolderId.includes && classConfigOrFolderId.includes.length > 0) {
    const included = new Set(classConfigOrFolderId.includes.map(n => n.trim().toLowerCase()));
    students = students.filter(s => included.has(s.name.trim().toLowerCase()));
  }
  
  return students;
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

async function getSubmissionFiles(folderId) {
  assertDrive();
  const res = await withDriveRetry(() => drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType, parents, webViewLink, webContentLink, thumbnailLink, iconLink)',
  }));
  return res.data.files || [];
}

async function getSubmissionFilesRecursive(rootFolderId) {
  const submissionFilesById = new Map();
  const folderQueue = [rootFolderId];
  const visitedFolderIds = new Set();

  while (folderQueue.length > 0) {
    const folderId = folderQueue.shift();
    if (!folderId || visitedFolderIds.has(folderId)) continue;
    visitedFolderIds.add(folderId);

    const [submissionFiles, childFolders] = await Promise.all([
      getSubmissionFiles(folderId),
      getChildFolders(folderId),
    ]);

    submissionFiles.forEach(file => {
      submissionFilesById.set(file.id, file);
    });

    childFolders.forEach(folder => {
      if (!visitedFolderIds.has(folder.id)) {
        folderQueue.push(folder.id);
      }
    });
  }

  return [...submissionFilesById.values()];
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

  const filesByFolderId = new Map(dayFolders.map(folder => [folder.id, []]));
  const nestedFiles = await Promise.all(dayFolders.map(async folder => [
    folder.id,
    await getAudioFilesRecursive(folder.id),
  ]));

  nestedFiles.forEach(([folderId, files]) => {
    filesByFolderId.set(folderId, files);
  });

  return filesByFolderId;
}

async function getSubmissionFilesForFolders(dayFolders) {
  assertDrive();
  if (!dayFolders.length) return new Map();

  const filesByFolderId = new Map(dayFolders.map(folder => [folder.id, []]));
  const nestedFiles = await Promise.all(dayFolders.map(async folder => [
    folder.id,
    await getSubmissionFilesRecursive(folder.id),
  ]));

  nestedFiles.forEach(([folderId, files]) => {
    filesByFolderId.set(folderId, files);
  });

  return filesByFolderId;
}

async function scanDaysFromDrive(classConfigOrFolderId) {
  assertDrive();
  const students = await getStudentFolders(classConfigOrFolderId);
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

function getFileExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function classifySubmissionFile(file) {
  const mimeType = String(file?.mimeType || file?.mime_type || '').toLowerCase();
  const extension = getFileExtension(file?.name || file?.file_name);

  if (mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (DOCUMENT_MIME_TYPES.has(mimeType) || DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  return 'file';
}

function toDriveOpenUrl(fileId) {
  return fileId ? `${GOOGLE_DRIVE_FILE_BASE_URL}/${fileId}/view` : '';
}

function toDrivePreviewUrl(fileId) {
  return fileId ? `${GOOGLE_DRIVE_FILE_BASE_URL}/${fileId}/preview` : '';
}

function toDriveFolderUrl(folderId) {
  return folderId ? `https://drive.google.com/drive/folders/${folderId}` : '';
}

function toSubmissionItem(file) {
  const driveFileId = file.driveFileId || file.drive_file_id || file.id;
  const parentFolderId = file.parentFolderId || file.parent_folder_id || file.parents?.[0] || null;
  const fileName = file.name || file.file_name || '';
  const mimeType = file.mimeType || file.mime_type || null;
  const kind = file.kind || file.file_kind || classifySubmissionFile(file);
  const contentUrl = driveFileId ? `/api/files/${driveFileId}/content` : '';

  const item = {
    q: file.question_label || file.q || fileName.replace(/\.[^/.]+$/, ''),
    name: fileName,
    kind,
    fileKind: kind,
    driveFileId,
    parentFolderId,
    mimeType,
    webViewLink: file.webViewLink || file.web_view_link || toDriveOpenUrl(driveFileId),
    folderUrl: file.folderUrl || file.folder_url || toDriveFolderUrl(parentFolderId),
    drivePreviewUrl: file.drivePreviewUrl || toDrivePreviewUrl(driveFileId),
    thumbnailLink: file.thumbnailLink || file.thumbnail_link || null,
    contentUrl,
    exportPdfUrl: driveFileId ? `/api/files/${driveFileId}/export?format=pdf` : '',
    status: 'pending',
  };

  if (kind === 'audio') {
    item.audioUrl = contentUrl;
  }

  return item;
}

function toSubmissionItems(files) {
  return files
    .sort((a, b) => (a.name || a.file_name || '').localeCompare(
      b.name || b.file_name || '',
      undefined,
      { sensitivity: 'base', numeric: true }
    ))
    .map(toSubmissionItem);
}

function safeHeaderFileName(fileName) {
  return String(fileName || 'submission')
    .replace(/[\r\n"]/g, '')
    .trim() || 'submission';
}

async function streamAudio(fileId, res, req) {
  return streamDriveFile(fileId, res, req);
}

async function streamDriveFile(fileId, res, req) {
  assertDrive();
  const metadata = await withDriveRetry(() => drive.files.get({
    fileId,
    fields: 'id, name, mimeType',
  }));

  const requestHeaders = {};
  if (req && req.headers.range) {
    requestHeaders.Range = req.headers.range;
  }

  const response = await withDriveRetry(() => drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream', headers: requestHeaders }
  ));

  res.status(response.status);

  const headersToForward = ['content-length', 'content-range', 'accept-ranges'];
  for (const header of headersToForward) {
    if (response.headers[header]) {
      res.setHeader(header, response.headers[header]);
    }
  }

  if (!res.hasHeader('accept-ranges')) {
    res.setHeader('Accept-Ranges', 'bytes');
  }

  const contentType = response.headers['content-type'] || metadata.data.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeHeaderFileName(metadata.data.name)}"`);
  response.data
    .on('end', () => {})
    .on('error', err => {
      console.error('Error streaming Drive file:', err);
    })
    .pipe(res);
}

async function exportGoogleWorkspaceFile(fileId, exportMimeType, res) {
  assertDrive();
  const metadata = await withDriveRetry(() => drive.files.get({
    fileId,
    fields: 'id, name, mimeType',
  }));

  const response = await withDriveRetry(() => drive.files.export(
    { fileId, mimeType: exportMimeType },
    { responseType: 'stream' }
  ));

  const extension = exportMimeType === 'application/pdf' ? '.pdf' : '.txt';
  const baseName = safeHeaderFileName(metadata.data.name).replace(/\.[^/.]+$/, '');
  res.setHeader('Content-Type', exportMimeType);
  res.setHeader('Content-Disposition', `inline; filename="${baseName}${extension}"`);
  response.data
    .on('end', () => {})
    .on('error', err => {
      console.error('Error exporting Drive file:', err);
    })
    .pipe(res);
}

module.exports = {
  classifySubmissionFile,
  exportGoogleWorkspaceFile,
  getAudioFilesForFolders,
  getChangesStartPageToken,
  getChangesSince,
  getChildFolders,
  getDayFolders,
  getDayFoldersForStudents,
  getSubmissionFilesForFolders,
  getStudentFolders,
  scanDaysFromDrive,
  streamDriveFile,
  streamAudio,
  toAudioAnswers,
  toSubmissionItem,
  toSubmissionItems,
};
