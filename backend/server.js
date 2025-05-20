require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const admin = require('firebase-admin');

// Initialize Firebase Admin (with error handling)
try {
  admin.initializeApp({
    credential: admin.credential.cert(require('./firebase-admin-key.json'))
  });
  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error("Firebase Admin init error:", error.message);
  process.exit(1); // Exit if Firebase fails
}

const app = express();
// Add this near the top (after 'const app = express()')
app.use(express.static('../frontend'));

// Add this route to handle frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
app.use(cors());
// app.use(express.json());

let ffmpegProcess;

// Verify Firebase token middleware
async function verifyToken(req, res, next) {
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  if (!idToken) return res.status(401).send('Unauthorized');

  try {
    req.user = await admin.auth().verifyIdToken(idToken);
    next();
  } catch (error) {
    res.status(403).send('Invalid token');
  }
}

// Start streaming endpoint
app.post('/start-stream', verifyToken, (req, res) => {
  const { platform, key, cameraDevice } = req.body;
  
  const rtmpUrl = platform === 'youtube' 
    ? `rtmp://a.rtmp.youtube.com/live2/${key}`
    : `rtmps://live-api-s.facebook.com:443/rtmp/${key}`;

  ffmpegProcess = exec(`
    ffmpeg -f v4l2 -i ${cameraDevice} \
    -c:v libx264 -preset ultrafast \
    -f flv ${rtmpUrl}
  `);

  ffmpegProcess.stderr.on('data', (data) => console.error(data));
  res.json({ status: 'Stream started!' });
});

// Stop streaming endpoint
app.post('/stop-stream', verifyToken, (req, res) => {
  ffmpegProcess?.kill();
  res.json({ status: 'Stream stopped!' });
});

app.listen(3000, () => console.log('Server running on port 3000'));