import { auth } from './firebase-config.js';
import { 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

// DOM elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const googleLoginBtn = document.getElementById('googleLogin');
const cameraSelect = document.getElementById('cameraSelect');
const addCameraBtn = document.getElementById('addCamera');
const refreshCamerasBtn = document.getElementById('refreshCameras');
const cameraGrid = document.getElementById('cameraGrid');
const startStreamBtn = document.getElementById('startStream');
const stopStreamBtn = document.getElementById('stopStream');
const startRecordingBtn = document.getElementById('startRecording');
const stopRecordingBtn = document.getElementById('stopRecording');

let activeCameras = {}; // Track active cameras by deviceId
let currentStream; // Keep reference to the last started stream (for recording/streaming)
let mediaRecorder;
let recordedChunks = [];

// Auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    authContainer.style.display = 'none';
    appContainer.style.display = 'block';
    loadCameras();
  } else {
    authContainer.style.display = 'block';
    appContainer.style.display = 'none';
    // Clear all cameras when logging out
    clearAllCameras();
  }
});

// Google login
googleLoginBtn.addEventListener('click', () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider);
});

// Load available cameras
async function loadCameras() {
  cameraSelect.innerHTML = '<option value="">Select a camera...</option>';
  try {
    // First request camera access with generic constraints
    await navigator.mediaDevices.getUserMedia({ video: true });
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');
    
    if (cameras.length === 0) {
      throw new Error('No cameras found');
    }
    
    cameras.forEach((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.text = camera.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Camera error:", err);
    alert(`Camera error: ${err.message}`);
  }
}

// Add new camera view
addCameraBtn.addEventListener('click', async () => {
  const deviceId = cameraSelect.value;
  if (!deviceId) {
    alert('Please select a camera first');
    return;
  }
  
  if (activeCameras[deviceId]) {
    alert('This camera is already active');
    return;
  }
  
  await addCameraView(deviceId);
});

// Add camera view to grid
async function addCameraView(deviceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    // Create video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.srcObject = stream;
    
    // Create camera container
    const cameraContainer = document.createElement('div');
    cameraContainer.className = 'camera-view';
    cameraContainer.dataset.deviceId = deviceId;
    
    // Add remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-camera';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = () => removeCameraView(deviceId);
    
    // Add camera label
    const label = document.createElement('div');
    label.className = 'camera-label';
    label.textContent = cameraSelect.options[cameraSelect.selectedIndex].text;
    
    // Assemble elements
    cameraContainer.appendChild(video);
    cameraContainer.appendChild(label);
    cameraContainer.appendChild(removeBtn);
    cameraGrid.appendChild(cameraContainer);
    
    // Store reference
    activeCameras[deviceId] = {
      stream,
      element: cameraContainer
    };
    
    // Set as current stream for recording/streaming
    currentStream = stream;
    
    // Enable UI elements when camera is working
    startStreamBtn.disabled = false;
    startRecordingBtn.disabled = false;
    
  } catch (err) {
    console.error("Camera start error:", err);
    alert(`Failed to start camera: ${err.message}`);
  }
}

// Remove camera view
function removeCameraView(deviceId) {
  if (activeCameras[deviceId]) {
    // Stop all tracks
    activeCameras[deviceId].stream.getTracks().forEach(track => track.stop());
    // Remove from DOM
    cameraGrid.removeChild(activeCameras[deviceId].element);
    // Remove from tracking
    delete activeCameras[deviceId];
    
    // Disable controls if no cameras left
    if (Object.keys(activeCameras).length === 0) {
      startStreamBtn.disabled = true;
      startRecordingBtn.disabled = true;
    }
  }
}

// Clear all cameras
function clearAllCameras() {
  Object.keys(activeCameras).forEach(deviceId => {
    removeCameraView(deviceId);
  });
}

refreshCamerasBtn.addEventListener('click', loadCameras);

// Stream controls
startStreamBtn.addEventListener('click', async () => {
  const idToken = await auth.currentUser.getIdToken();
  const platform = document.getElementById('platformSelect').value;
  const key = document.getElementById('streamKey').value;
  
  // Note: This will only stream the last added camera
  // You might want to modify this to stream a composition of all cameras
  fetch('/start-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ platform, key, stream: currentStream })
  }).then(response => response.json())
    .then(data => {
      startStreamBtn.disabled = true;
      stopStreamBtn.disabled = false;
    });
});

stopStreamBtn.addEventListener('click', async () => {
  const idToken = await auth.currentUser.getIdToken();
  
  fetch('http://localhost:3000/stop-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    }
  }).then(response => response.json())
    .then(data => {
      startStreamBtn.disabled = false;
      stopStreamBtn.disabled = true;
    });
});

// Recording controls
startRecordingBtn.addEventListener('click', () => {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(currentStream);
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.webm';
    a.click();
  };
  
  mediaRecorder.start();
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = false;
});

stopRecordingBtn.addEventListener('click', () => {
  mediaRecorder.stop();
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
});