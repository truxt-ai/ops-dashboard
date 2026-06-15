'use strict';

const crypto = require('node:crypto');

function bodyToBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  if (typeof rawBody === 'string') {
    return Buffer.from(rawBody, 'utf8');
  }

  return Buffer.from(JSON.stringify(rawBody || {}), 'utf8');
}

function digestPayload(rawBody, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(bodyToBuffer(rawBody))
    .digest('hex');
}

function normalizeSignatures(signature) {
  if (!signature || typeof signature !== 'string') {
    return [];
  }

  return signature.split(',').reduce((values, part) => {
    const trimmed = part.trim();
    if (!trimmed) return values;

    const match = trimmed.match(/^v1=(.+)$/);
    values.push(match ? match[1] : trimmed);
    return values;
  }, []);
}

function signPayload(payload, secret) {
  return digestPayload(payload, secret);
}

function verifyPayload(rawBody, signature, secret) {
  const expected = digestPayload(rawBody, secret);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const candidates = normalizeSignatures(signature);

  const matched = candidates.some((candidate) => {
    if (!/^[0-9a-fA-F]+$/.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, 'hex');
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
  });

  if (!matched) {
    throw new Error('invalid signature');
  }

  return true;
}

module.exports = {
  signPayload,
  verifyPayload,
};
