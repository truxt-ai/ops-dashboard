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

function payloadToSign(rawBody, timestamp) {
  if (!timestamp) {
    return bodyToBuffer(rawBody);
  }

  return Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), bodyToBuffer(rawBody)]);
}

function digestPayload(rawBody, secret, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadToSign(rawBody, timestamp))
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

function signatureTimestamp(signature) {
  if (!signature || typeof signature !== 'string') {
    return null;
  }

  const part = signature.split(',').find((value) => value.trim().startsWith('t='));
  return part ? part.trim().slice(2) : null;
}

function signPayload(payload, secret) {
  return digestPayload(payload, secret);
}

function createSignatureHeader(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${digestPayload(payload, secret, timestamp)}`;
}

function parsePayload(rawBody) {
  return JSON.parse(bodyToBuffer(rawBody).toString('utf8'));
}

function verifyPayload(rawBody, signature, secret) {
  const timestamp = signatureTimestamp(signature);
  const expectedBuffers = [
    Buffer.from(digestPayload(rawBody, secret), 'hex'),
    timestamp ? Buffer.from(digestPayload(rawBody, secret, timestamp), 'hex') : null,
  ].filter(Boolean);
  const candidates = normalizeSignatures(signature);

  const matched = candidates.some((candidate) => {
    if (!/^[0-9a-fA-F]+$/.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, 'hex');
    return expectedBuffers.some((expectedBuffer) => {
      if (candidateBuffer.length !== expectedBuffer.length) return false;
      return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
    });
  });

  if (!matched) {
    throw new Error('invalid signature');
  }

  return true;
}

function constructWebhookEvent(rawBody, signature, secret) {
  verifyPayload(rawBody, signature, secret);
  return parsePayload(rawBody);
}

module.exports = {
  bodyToBuffer,
  createSignatureHeader,
  constructWebhookEvent,
  digestPayload,
  parsePayload,
  signPayload,
  verifyPayload,
};
