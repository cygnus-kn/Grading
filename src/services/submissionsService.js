const { normalizeDays } = require('../utils/days');
const {
  getChildFolders,
  getDayFolders,
  getDayFoldersForStudents,
  getSubmissionFilesForFolders,
  getStudentFolders,
  scanDaysFromDrive,
  toSubmissionItems,
} = require('./driveService');
const {
  readDayFoldersMemoryCache,
  writeDayFoldersMemoryCache,
} = require('./cacheService');

async function getCachedDayFolders(classId, classConfig) {
  const cached = readDayFoldersMemoryCache(classId);
  if (cached) return cached;

  const dayFolders = await getDayFolders(classConfig.folderId);
  writeDayFoldersMemoryCache(classId, dayFolders);
  return dayFolders;
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
  const filesByFolderId = await getSubmissionFilesForFolders([...dayFoldersByStudentId.values()]);

  return students.map(student => {
    const dayFolder = dayFoldersByStudentId.get(student.id);
    const files = dayFolder ? (filesByFolderId.get(dayFolder.id) || []) : [];
    const submissionFiles = toSubmissionItems(files);
    return {
      id: student.id,
      name: student.name,
      answers: submissionFiles,
      submissionFiles,
    };
  });
}

async function getDayFirstSubmissions(classId, classConfig, day) {
  const dayFolders = await getCachedDayFolders(classId, classConfig);
  const dayFolder = dayFolders.find(folder => String(folder.day) === String(day));
  if (!dayFolder) return [];

  const students = await getChildFolders(dayFolder.id);
  const filesByFolderId = await getSubmissionFilesForFolders(students);

  return students.map(student => {
    const submissionFiles = toSubmissionItems(filesByFolderId.get(student.id) || []);
    return {
      id: student.id,
      name: student.name,
      answers: submissionFiles,
      submissionFiles,
    };
  });
}

async function getDriveSubmissions(classId, classConfig, day) {
  return classConfig.layout === 'day-first'
    ? getDayFirstSubmissions(classId, classConfig, day)
    : getStudentFirstSubmissions(classConfig, day);
}

module.exports = {
  getDriveSubmissions,
  scanDaysForClass,
};
