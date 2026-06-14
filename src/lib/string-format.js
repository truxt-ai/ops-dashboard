'use strict';

// Truncate a long string by keeping its beginning and end and joining them with
// a single middle ellipsis (e.g. truncateMiddle('abcdefghij', 7) -> 'abc…hij').
// Pure: no DOM, storage, timers, locale, network, or shared state.

const ELLIPSIS = '…';

function truncateMiddle(text, maxLength) {
  if (text.length <= maxLength) return text;
  if (maxLength < 2) return ELLIPSIS;
  // One slot is reserved for the ellipsis; the remaining budget of maxLength - 1
  // characters is split between head and tail as evenly as possible, with the
  // head taking the extra character when the remaining budget is odd.
  const budget = maxLength - 1;
  const headLen = Math.ceil(budget / 2);
  const tailLen = budget - headLen;
  return text.slice(0, headLen) + ELLIPSIS + text.slice(text.length - tailLen);
}

module.exports = { truncateMiddle };
