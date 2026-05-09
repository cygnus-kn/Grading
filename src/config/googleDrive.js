const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEY_FILE = path.join(__dirname, '..', '..', 'credentials.json');

let drive = null;

try {
  if (process.env.GOOGLE_CREDENTIALS) {
    console.log('Using GOOGLE_CREDENTIALS environment variable');
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: SCOPES,
    });
    drive = google.drive({ version: 'v3', auth });
  } else if (fs.existsSync(KEY_FILE)) {
    console.log('Using local credentials.json file');
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE,
      scopes: SCOPES,
    });
    drive = google.drive({ version: 'v3', auth });
  } else {
    console.error('CRITICAL: No Google credentials found (env or file). API will fail.');
  }
} catch (err) {
  console.error('Error initializing Google Auth:', err.message);
}

module.exports = {
  drive,
};
