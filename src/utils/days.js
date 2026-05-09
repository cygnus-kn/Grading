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
  const rawName = String(folderName || '').trim();
  const standaloneNumber = rawName.match(/^0*(\d+)$/);
  if (standaloneNumber) return parseInt(standaloneNumber[1], 10);

  const cleaned = rawName.toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/(?:homework|hw|day|d|ngày|ngay)0*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function matchesDayFolder(folderName, targetDay) {
  return parseDayNumber(folderName) === Number(targetDay);
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
