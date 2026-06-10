const { test } = require('node:test');
const assert = require('node:assert');
const { mapChangesToClassIds } = require('../src/services/supabaseMetadataService');

test('mapChangesToClassIds', async (t) => {
  const classRows = [
    { id: 'C1', drive_folder_id: 'rootC1' },
    { id: 'C2', drive_folder_id: 'rootC2' },
  ];
  
  const studentRows = [
    { id: 'student1', class_id: 'C1', drive_folder_id: 'folderS1' },
    { id: 'student2', class_id: 'C2', drive_folder_id: 'folderS2' },
  ];
  
  const submissionRows = [
    { drive_folder_id: 'dayFolder1', class_id: 'C1' },
  ];

  await t.test('detects change in root class folder', () => {
    const changes = [{ file: { id: 'rootC1' } }];
    const result = mapChangesToClassIds(changes, classRows, studentRows, submissionRows);
    assert.deepStrictEqual([...result.changedClassIds], ['C1']);
  });

  await t.test('detects change in student folder (by ID or folder ID)', () => {
    // By student ID (since student.id can be used as fallback)
    const changes1 = [{ file: { id: 'student2' } }];
    const result1 = mapChangesToClassIds(changes1, classRows, studentRows, submissionRows);
    assert.deepStrictEqual([...result1.changedClassIds], ['C2']);

    // By student drive_folder_id
    const changes2 = [{ file: { id: 'folderS1' } }];
    const result2 = mapChangesToClassIds(changes2, classRows, studentRows, submissionRows);
    assert.deepStrictEqual([...result2.changedClassIds], ['C1']);
  });

  await t.test('detects change inside a known day folder (parent matches)', () => {
    const changes = [{ file: { id: 'newSubmissionFile', parents: ['dayFolder1'] } }];
    const result = mapChangesToClassIds(changes, classRows, studentRows, submissionRows);
    assert.deepStrictEqual([...result.changedClassIds], ['C1']);
  });

  await t.test('ignores unknown file without known parents', () => {
    const changes = [{ file: { id: 'unknownFile', parents: ['unknownParent'] } }];
    const result = mapChangesToClassIds(changes, classRows, studentRows, submissionRows);
    assert.strictEqual(result.changedClassIds.size, 0);
  });

  await t.test('returns allClasses=true when a file is removed but no metadata is present', () => {
    const changes = [{ removed: true }];
    const result = mapChangesToClassIds(changes, classRows, studentRows, submissionRows);
    assert.strictEqual(result.allClasses, true);
    assert.strictEqual(result.changedClassIds, undefined);
  });
});
