const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- MOCK DATA ---
const mockSubmissions = {
  1: [
    { id: 's1', name: 'Alice Smith', audioUrl: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
    { id: 's2', name: 'Bob Johnson', audioUrl: 'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg' },
    { id: 's3', name: 'Charlie Brown', audioUrl: 'https://actions.google.com/sounds/v1/water/water_leak.ogg' }
  ],
  2: [
    { id: 's1', name: 'Alice Smith', audioUrl: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
    { id: 's4', name: 'Diana Prince', audioUrl: 'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg' }
  ]
};

// --- MOCK API ROUTES ---

// Get submissions for a specific day
app.get('/api/submissions', (req, res) => {
  const day = req.query.day;
  if (!day) {
    return res.status(400).json({ error: 'Day parameter is required' });
  }

  const submissions = mockSubmissions[day] || [];
  
  // Simulate network delay
  setTimeout(() => {
    res.json(submissions);
  }, 500);
});

// Submit feedback for a student
app.post('/api/feedback', (req, res) => {
  const { studentId, day, notes } = req.body;

  if (!studentId || !day || !notes) {
    return res.status(400).json({ error: 'Missing required fields (studentId, day, notes)' });
  }

  console.log(`[Mock Google Sheets API] Writing to sheet for Student ${studentId}...`);
  console.log(`Data: Day ${day} | Notes: "${notes}"`);

  // Simulate network delay and success
  setTimeout(() => {
    res.json({ success: true, message: 'Feedback successfully saved to Google Sheet.' });
  }, 800);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log('Serving mock data for the demo.');
});
