require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', apiRoutes);

  return app;
}

module.exports = createApp;
