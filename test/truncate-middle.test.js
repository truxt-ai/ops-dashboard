'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const STRING_FORMAT_MODULE = '../src/lib/string-format';

function loadTruncateMiddle() {
  const stringFormat = require(STRING_FORMAT_MODULE);
  assert.equal(
    typeof stringFormat.truncateMiddle,
    'function',
    'src/lib/string-format must export truncateMiddle(text, maxLength)',
  );
  return stringFormat.truncateMiddle;
}

test('truncateMiddle follows the dashboard middle-truncation contract', () => {
  const truncateMiddle = loadTruncateMiddle();

  const cases = [
    {
      name: 'documented example preserves visible head and tail',
      text: 'hello world',
      maxLength: 8,
      want: 'hel…rld',
    },
    {
      name: 'already-short text is returned unchanged',
      text: 'hello',
      maxLength: 12,
      want: 'hello',
    },
    {
      name: 'exact-length text is returned unchanged',
      text: 'dashboard',
      maxLength: 9,
      want: 'dashboard',
    },
    {
      name: 'even remaining budget is split evenly',
      text: 'abcdefghij',
      maxLength: 7,
      want: 'abc…hij',
    },
    {
      name: 'odd remaining budget gives the extra character to the head',
      text: 'abcdefghij',
      maxLength: 6,
      want: 'abc…ij',
    },
    {
      name: 'maxLength zero returns ellipsis when truncation is needed',
      text: 'abc',
      maxLength: 0,
      want: '…',
    },
    {
      name: 'maxLength one returns ellipsis when truncation is needed',
      text: 'abc',
      maxLength: 1,
      want: '…',
    },
    {
      name: 'empty string is a valid no-throw input',
      text: '',
      maxLength: 4,
      want: '',
    },
  ];

  for (const { name, text, maxLength, want } of cases) {
    assert.equal(truncateMiddle(text, maxLength), want, name);
  }
});

test('truncateMiddle uses one Unicode ellipsis and respects truncated length bounds', () => {
  const truncateMiddle = loadTruncateMiddle();

  const truncatedCases = [
    { text: 'hello world', maxLength: 8 },
    { text: 'abcdefghij', maxLength: 7 },
    { text: 'abcdefghij', maxLength: 6 },
  ];

  for (const { text, maxLength } of truncatedCases) {
    const result = truncateMiddle(text, maxLength);
    assert.ok(result.length <= maxLength, `${result} fits within ${maxLength}`);
    assert.equal([...result].filter((char) => char === '…').length, 1);
    assert.equal(result.includes('...'), false);
  }
});
