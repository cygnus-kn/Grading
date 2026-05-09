const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesDayFolder, parseDayNumber } = require('../src/utils/days');

test('parses supported student homework folder names', () => {
  [
    ['Day 1', 1],
    ['Day01', 1],
    ['day1', 1],
    ['Ngày 1', 1],
    ['ngay1', 1],
    ['Hw day 17', 17],
    ['HW1', 1],
    ['Hw16', 16],
    ['D17', 17],
    ['1', 1],
    ['017', 17],
    ['Day 1_23.03.26', 1],
    ['Day 2: 25/3', 2],
  ].forEach(([folderName, expectedDay]) => {
    assert.equal(parseDayNumber(folderName), expectedDay);
    assert.equal(matchesDayFolder(folderName, expectedDay), true);
  });
});

test('ignores date-only folders', () => {
  ['23.03', '25.03', '01.04.26'].forEach(folderName => {
    assert.equal(parseDayNumber(folderName), null);
    assert.equal(matchesDayFolder(folderName, 1), false);
  });
});

test('does not match a different day in a date suffix', () => {
  assert.equal(matchesDayFolder('Day 1_23.03.26', 23), false);
  assert.equal(matchesDayFolder('Day 2: 25/3', 25), false);
});
