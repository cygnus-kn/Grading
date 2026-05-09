const createApp = require('./src/app');

const PORT = process.env.PORT || 3001;
const app = createApp();

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Connected to Google Drive for S136');
  });
}

module.exports = app;
