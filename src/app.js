'use strict';

const path = require('path');
const express = require('express');
const { registerDashboard } = require('./routes/dashboard');
const { registerPromoCodes } = require('./routes/promo-codes');
const { registerHealth } = require('./routes/health');
const { requireDashboardAuth } = require('./lib/dashboard-auth');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.all(['/', '/health/upstream'], requireDashboardAuth);
app.use('/api', requireDashboardAuth);

registerDashboard(app);
registerPromoCodes(app);
registerHealth(app);

module.exports = { app };
