function normalizeDays(days) {
  if (!Array.isArray(days)) return null;

  const dayNumbers = [...new Set(days
    .map(item => Number(item && item.day))
    .filter(Number.isInteger))]
    .sort((a, b) => b - a);

  if (dayNumbers.length === 0) return [];
  return dayNumbers.map(day => ({ day }));
}

function parseDayNumber(folderName) {
  const cleaned = String(folderName || '').toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/(?:day|d|ngày|ngay)0*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function matchesDayFolder(folderName, targetDay) {
  const dayPattern = new RegExp(`(?:day|ngày|ngay)0*${targetDay}(?!\\d)`, 'i');
  const name = String(folderName || '').replace(/\s+/g, '');
  return dayPattern.test(name);
}

function toQuestionLabel(fileName) {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

module.exports = {
  matchesDayFolder,
  normalizeDays,
  parseDayNumber,
  toQuestionLabel,
};
