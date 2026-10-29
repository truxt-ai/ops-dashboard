'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

function requireDashboardAuth(req, res, next) {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return res.status(503).json({ error: 'auth not configured' });

  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) return res.status(401).json({ error: 'unauthorized' });

  const expected = createHash('sha256').update(token).digest();
  const supplied = createHash('sha256').update(match[1]).digest();
  if (!timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { requireDashboardAuth };
