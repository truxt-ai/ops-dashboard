'use strict';

// Truncate a long string by keeping its beginning and end and joining them with
// a single middle ellipsis (e.g. truncateMiddle('hello world', 8) -> 'hel…rld').
// Pure: no DOM, storage, timers, locale, network, or shared state.

const ELLIPSIS = '…';

function truncateMiddle(text, maxLength) {
  if (text.length <= maxLength) return text;
  if (maxLength < 2) return ELLIPSIS;
  // Keep maxLength - 1 visible slots: one for the ellipsis, the rest split
  // between head and tail as evenly as possible with the head taking the extra
  // character when the remaining budget is odd.
  const budget = maxLength - 2;
  const headLen = Math.ceil(budget / 2);
  const tailLen = budget - headLen;
  return text.slice(0, headLen) + ELLIPSIS + text.slice(text.length - tailLen);
}

module.exports = { truncateMiddle };
