require('dotenv').config();
const { drive } = require('./src/config/googleDrive');

async function main() {
  try {
    const res = await drive.files.list({
      q: `'1Iu0GOJKXT96i6yOBQPNBkITVytG2GHef' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
    });
    
    for (const student of res.data.files) {
      console.log(`\nStudent: ${student.name}`);
      const dayRes = await drive.files.list({
        q: `'${student.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100,
      });
      if (dayRes.data.files && dayRes.data.files.length > 0) {
        dayRes.data.files.forEach(d => console.log(`  - ${d.name}`));
      } else {
        console.log(`  (No folders found)`);
      }
    }
  } catch (error) {
    console.error(error);
  }
}
main();
