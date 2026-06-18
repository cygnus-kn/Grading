const CLASS_FOLDERS = {
  S141: {
    folderId: '1ozv7HFROs1sjrOFOS8JefqN12lgJCVpJ',
    layout: 'student-first',
  },
  S133: {
    folderId: '1A-ADtlofvngCOB126WYVBmfW9pexbyUn',
    layout: 'student-first',
  },

  S136: {
    folderId: '1QmoSJCr5RV-9SrvwyQU8bRMLfQwztW6r',
    layout: 'student-first',
  },
  S139: {
    folderId: '1_HbriUD_EsCny2YjIeyA-E3pAJMNLHG0',
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
