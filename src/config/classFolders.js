const CLASS_FOLDERS = {
  S133: {
    folderId: '1A-ADtlofvngCOB126WYVBmfW9pexbyUn',
    layout: 'student-first',
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
