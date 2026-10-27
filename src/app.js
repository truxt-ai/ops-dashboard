'use strict';

const path = require('path');
const express = require('express');
const { registerDashboard } = require('./routes/dashboard');
const { registerPromoCodes } = require('./routes/promo-codes');
const { registerHealth } = require('./routes/health');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

registerDashboard(app);
registerPromoCodes(app);
registerHealth(app);

module.exports = { app };
