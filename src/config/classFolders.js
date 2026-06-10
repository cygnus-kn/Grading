const CLASS_FOLDERS = {
  S141: {
    folderId: '1ozv7HFROs1sjrOFOS8JefqN12lgJCVpJ',
    layout: 'student-first',
  },
  S133: {
    folderId: '1A-ADtlofvngCOB126WYVBmfW9pexbyUn',
    layout: 'student-first',
  },
  S134: {
    folderId: '1Iu0GOJKXT96i6yOBQPNBkITVytG2GHef',
    layout: 'student-first',
    includes: [
      'Cao Tiến Cường',
      'Võ Anh Kiệt',
      'Nguyễn Hoàng Uyên',
      'Trương Khánh Như',
      'Nguyễn Quang Dũng',
      'Nguyễn Trọng Trung Hiếu',
      'Chu Thị Thu Hoài'
    ],
  },
  S136: {
    folderId: '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r',
    layout: 'student-first',
  },
};

function getClassConfig(classId) {
  const config = CLASS_FOLDERS[classId];
  if (!config) return null;
  if (typeof config === 'string') {
    return { folderId: config, layout: 'student-first' };
  }
  return config;
}

module.exports = {
  CLASS_FOLDERS,
  getClassConfig,
};
