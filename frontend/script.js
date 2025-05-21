import { auth } from './firebase-config.js';
import { 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

// DOM Elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const googleLoginBtn = document.getElementById('googleLogin');
const cameraGrid = document.getElementById('cameraGrid');
const sceneList = document.getElementById('sceneList');
const addSceneBtn = document.getElementById('addScene');
const studioModeBtn = document.getElementById('studioMode');
const virtualCamBtn = document.getElementById('virtualCam');
const settingsBtn = document.getElementById('settingsBtn');
const startStreamBtn = document.getElementById('startStream');
const stopStreamBtn = document.getElementById('stopStream');
const startRecordingBtn = document.getElementById('startRecording');
const stopRecordingBtn = document.getElementById('stopRecording');
const platformSelect = document.getElementById('platformSelect');
const streamKeyInput = document.getElementById('streamKey');
const micVolume = document.querySelector('.audio-controls .volume-slider:first-child');
const speakerVolume = document.querySelector('.audio-controls .volume-slider:last-child');
const sourceButtons = document.querySelectorAll('.source-btn');

// Application State
let activeCameras = {};
let currentStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext;
let micStream;
let destinationNode;
const scrollUpBtn = document.getElementById('scrollUpBtn');
const scrollDownBtn = document.getElementById('scrollDownBtn');

let scenes = {
  'Default Scene': []
};
let currentScene = 'Default Scene';
let isStudioMode = false;
let virtualCamActive = false;
let micGainNode = null;
let speakerGainNode = null;

// Initialize the application
init();

function init() {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('themePreference') || 'dark';
  document.body.classList.add(`${savedTheme}-theme`);
  
  setupEventListeners();
  setupDefaultScene();
}

function setupEventListeners() {
  // Auth
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
  }

  // Sources
  sourceButtons.forEach(btn => {
    btn.addEventListener('click', () => handleSourceButton(btn.dataset.type));
  });

  // Scenes
  if (addSceneBtn) {
    addSceneBtn.addEventListener('click', handleAddScene);
  }

  // Controls
  if (studioModeBtn) {
    studioModeBtn.addEventListener('click', toggleStudioMode);
  }
  
  if (virtualCamBtn) {
    virtualCamBtn.addEventListener('click', toggleVirtualCamera);
  }
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }

  // Streaming
  if (startStreamBtn && stopStreamBtn) {
    startStreamBtn.addEventListener('click', startStreaming);
    stopStreamBtn.addEventListener('click', stopStreaming);
  }

  // Recording
  if (startRecordingBtn && stopRecordingBtn) {
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
  }

  // Audio
  if (micVolume && speakerVolume) {
    micVolume.addEventListener('input', adjustMicVolume);
    speakerVolume.addEventListener('input', adjustSpeakerVolume);
  }

  // Auth State
  onAuthStateChanged(auth, handleAuthStateChange);
}

// Authentication
function handleGoogleLogin() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider);
}

function handleAuthStateChange(user) {
  if (user) {
    authContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    initializeAudio();
    loadCameras();
  } else {
    authContainer.style.display = 'flex';
    appContainer.style.display = 'none';
    cleanup();
  }
}

// Audio Handling
function initializeAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    micGainNode = audioContext.createGain();
    speakerGainNode = audioContext.createGain();
    
    // Set initial volumes
    micGainNode.gain.value = micVolume.value / 100;
    speakerGainNode.gain.value = speakerVolume.value / 100;
  } catch (error) {
    console.error('Audio initialization failed:', error);
  }
}

function adjustMicVolume(e) {
  if (micGainNode) {
    micGainNode.gain.value = e.target.value / 100;
  }
}

function adjustSpeakerVolume(e) {
  if (speakerGainNode) {
    speakerGainNode.gain.value = e.target.value / 100;
  }
}

// Camera Handling
async function loadCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error loading cameras:', error);
    return [];
  }
}

// Source Handling
async function handleSourceButton(sourceType) {
  switch (sourceType) {
    case 'camera':
      await handleCameraSource();
      break;
    case 'screen':
      await handleScreenCapture();
      break;
    case 'image':
      handleImageSource();
      break;
    case 'text':
      handleTextSource();
      break;
  }
}

async function handleCameraSource() {
  const cameras = await loadCameras();
  
  if (cameras.length === 0) {
    alert('No cameras found');
    return;
  }

  if (cameras.length === 1) {
    await addCameraView(cameras[0]);
  } else {
    const selectedCamera = await showCameraSelection(cameras);
    if (selectedCamera) {
      await addCameraView(selectedCamera);
    }
  }
}

async function showCameraSelection(cameras) {
  return new Promise(resolve => {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog camera-selection';
    dialog.innerHTML = `
      <div class="dialog-content">
        <div class="dialog-header">
          <h3><i class="fas fa-video"></i> Select Camera</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="camera-grid">
          ${cameras.map((cam, i) => `
            <div class="camera-card" data-index="${i}">
              <div class="camera-preview">
                <i class="fas fa-camera"></i>
              </div>
              <div class="camera-info">
                <h4>${cam.label || `Camera ${i + 1}`}</h4>
                <button class="select-btn">Select</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Add click handlers
    dialog.querySelectorAll('.camera-card').forEach(card => {
      card.addEventListener('click', () => {
        resolve(cameras[card.dataset.index]);
        dialog.remove();
      });
    });

    dialog.querySelector('.close-btn').addEventListener('click', () => {
      resolve(null);
      dialog.remove();
    });
  });
}
// Modified addCameraView function to include audio
async function addCameraView(camera) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: camera.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: true // Request audio from camera if available
    });

    // Create video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true; // Mute to avoid echo
    video.srcObject = stream;

    // Add audio to mix if available
    if (stream.getAudioTracks().length > 0 && audioContext) {
      const audioSource = audioContext.createMediaStreamSource(stream);
      const audioGain = audioContext.createGain();
      audioGain.gain.value = 0.5; // Default volume
      audioSource.connect(audioGain).connect(destinationNode);
    }

    // ... rest of your camera setup code ...
  } catch (error) {
    console.error('Camera error:', error);
  }
}
// Screen Capture
async function handleScreenCapture() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.srcObject = stream;

    const container = createSourceContainer('screen', 'Screen Capture', video);
    cameraGrid.appendChild(container);

    const sourceId = `screen-${Date.now()}`;
    scenes[currentScene].push({ id: sourceId, type: 'screen', element: container });

    stream.getVideoTracks()[0].onended = () => {
      container.remove();
    };

  } catch (error) {
    if (error.name !== 'NotAllowedError') {
      console.error('Screen capture error:', error);
      alert(`Screen capture failed: ${error.message}`);
    }
  }
}

// Image Source
function handleImageSource() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement('img');
      img.src = event.target.result;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';

      const container = createSourceContainer('image', file.name, img);
      cameraGrid.appendChild(container);

      const sourceId = `image-${Date.now()}`;
      scenes[currentScene].push({ id: sourceId, type: 'image', element: container });
    };
    reader.readAsDataURL(file);
  };
  
  input.click();
}

// Text Source
function handleTextSource() {
  const text = prompt('Enter text to display:');
  if (!text) return;

  const textElement = document.createElement('div');
  textElement.className = 'text-source';
  textElement.textContent = text;
  textElement.style.color = 'white';
  textElement.style.fontSize = '24px';
  textElement.style.padding = '10px';

  const container = createSourceContainer('text', 'Text Source', textElement);
  cameraGrid.appendChild(container);

  const sourceId = `text-${Date.now()}`;
  scenes[currentScene].push({ id: sourceId, type: 'text', element: container });
}

// Scene Management
function setupDefaultScene() {
  if (sceneList && !sceneList.querySelector('.scene-btn')) {
    const btn = document.createElement('button');
    btn.className = 'scene-btn active';
    btn.textContent = 'Default Scene';
    btn.onclick = () => switchScene('Default Scene');
    sceneList.appendChild(btn);
  }
}

function handleAddScene() {
  const sceneName = prompt('Enter scene name:');
  if (!sceneName || scenes[sceneName]) return;

  scenes[sceneName] = [];
  
  const btn = document.createElement('button');
  btn.className = 'scene-btn';
  btn.textContent = sceneName;
  btn.onclick = () => switchScene(sceneName);
  sceneList.appendChild(btn);
}

function switchScene(sceneName) {
  // Hide current scene elements
  scenes[currentScene].forEach(source => {
    if (source.element && source.element.parentNode === cameraGrid) {
      source.element.style.display = 'none';
    }
  });

  // Show new scene elements
  currentScene = sceneName;
  scenes[sceneName].forEach(source => {
    if (source.element) {
      // If element exists but isn't in DOM (from previous switch)
      if (!source.element.parentNode) {
        cameraGrid.appendChild(source.element);
      }
      source.element.style.display = 'block';
    }
  });

  // Update active button
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === sceneName);
  });
}

// Studio Mode
function toggleStudioMode() {
  isStudioMode = !isStudioMode;
  studioModeBtn.classList.toggle('active', isStudioMode);
  
  if (isStudioMode) {
    // Create preview/program layout
    alert('Studio mode activated. This would show a preview/program layout in a full implementation.');
  } else {
    // Return to normal view
    alert('Studio mode deactivated.');
  }
}

// Virtual Camera
function toggleVirtualCamera() {
  virtualCamActive = !virtualCamActive;
  virtualCamBtn.classList.toggle('active', virtualCamActive);
  
  if (virtualCamActive) {
    alert('Virtual camera activated. This would feed your output to virtual camera software in a full implementation.');
  } else {
    alert('Virtual camera deactivated.');
  }
}

// Settings
function openSettings() {
  const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  
  const settingsHtml = `
    <div class="settings-dialog">
      <div class="dialog-header">
        <h3><i class="fas fa-cog"></i> Settings</h3>
        <button class="close-btn">&times;</button>
      </div>
      
      <div class="settings-sections">
        <!-- Theme Section -->
        <div class="settings-section">
          <h4><i class="fas fa-palette"></i> Appearance</h4>
          <div class="theme-toggle">
            <label>
              <input type="radio" name="theme" value="light" ${currentTheme === 'light' ? 'checked' : ''}>
              <span class="toggle-option">
                <i class="fas fa-sun"></i> Light Mode
              </span>
            </label>
            <label>
              <input type="radio" name="theme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''}>
              <span class="toggle-option">
                <i class="fas fa-moon"></i> Dark Mode
              </span>
            </label>
          </div>
        </div>
        
        <!-- Other settings sections... -->
      </div>
      
      <div class="dialog-footer">
        <button id="saveSettings" class="primary-btn">Save Settings</button>
        <button id="closeSettings" class="secondary-btn">Cancel</button>
      </div>
    </div>
  `;
  
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.innerHTML = settingsHtml;
  document.body.appendChild(dialog);

  // Theme change handler
  dialog.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.body.classList.toggle('dark-theme', e.target.value === 'dark');
      document.body.classList.toggle('light-theme', e.target.value === 'light');
    });
  });

  // Save handler
  dialog.querySelector('#saveSettings').addEventListener('click', () => {
    const theme = dialog.querySelector('input[name="theme"]:checked').value;
    localStorage.setItem('themePreference', theme);
    dialog.remove();
  });

  // Close handler
  dialog.querySelector('#closeSettings').addEventListener('click', () => {
    // Revert to original theme
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    document.body.classList.toggle('light-theme', currentTheme === 'light');
    dialog.remove();
  });
}

// Streaming
async function startStreaming() {
  if (!currentStream) {
    alert('No active video source to stream');
    return;
  }

  const platform = platformSelect.value;
  const key = streamKeyInput.value.trim();

  if (!key) {
    alert('Please enter a stream key');
    return;
  }

  try {
    const idToken = await auth.currentUser.getIdToken();
    
    // In a real app, you would send this to your server
    console.log('Starting stream to', platform, 'with key:', key);
    
    startStreamBtn.disabled = true;
    stopStreamBtn.disabled = false;
    alert(`Streaming started to ${platform}`);
    
  } catch (error) {
    console.error('Stream start error:', error);
    alert(`Failed to start stream: ${error.message}`);
  }
}

function stopStreaming() {
  // In a real app, you would send this to your server
  console.log('Stopping stream');
  
  startStreamBtn.disabled = false;
  stopStreamBtn.disabled = true;
  alert('Streaming stopped');
}

// Recording
function startRecording() {
  if (!currentStream) {
    alert('No active video source to record');
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(currentStream);
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  
  mediaRecorder.onstop = saveRecording;
  
  mediaRecorder.start();
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = false;
  
  alert('Recording started');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
  }
}

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `recording-${new Date().toISOString()}.webm`;
  a.click();
  
  alert('Recording saved');
}

// Helper Functions
function createSourceContainer(type, label, contentElement) {
  const container = document.createElement('div');
  container.className = `${type}-view source-view`;
  
  const labelElement = document.createElement('div');
  labelElement.className = 'source-label';
  labelElement.textContent = label;
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-source';
  removeBtn.innerHTML = '×';
  removeBtn.onclick = () => container.remove();
  
  container.appendChild(contentElement);
  container.appendChild(labelElement);
  container.appendChild(removeBtn);
  
  return container;
}

function updateControlStates() {
  const hasActiveSource = Object.keys(activeCameras).length > 0;
  
  if (startStreamBtn) startStreamBtn.disabled = !hasActiveSource;
  if (startRecordingBtn) startRecordingBtn.disabled = !hasActiveSource;
}

function cleanup() {
  // Stop all camera streams
  Object.values(activeCameras).forEach(({ stream }) => {
    stream.getTracks().forEach(track => track.stop());
  });
  activeCameras = {};
  
  // Stop recording if active
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  // Clear the camera grid
  while (cameraGrid.firstChild) {
    cameraGrid.removeChild(cameraGrid.firstChild);
  }
  
  // Reset UI states
  updateControlStates();
}


async function setupAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    destinationNode = audioContext.createMediaStreamDestination();
    
    // Setup microphone
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const micSource = audioContext.createMediaStreamSource(micStream);
    const micGain = audioContext.createGain();
    micGain.gain.value = micVolume.value / 100;
    micSource.connect(micGain).connect(destinationNode);
    
    // Setup volume controls
    micVolume.addEventListener('input', () => {
      micGain.gain.value = micVolume.value / 100;
    });
    
    speakerVolume.addEventListener('input', () => {
      audioContext.destination.volume = speakerVolume.value / 100;
    });
    
  } catch (error) {
    console.error('Audio setup error:', error);
  }
}

// Call this in your auth state handler after login
setupAudio();

//
if (scrollUpBtn && scrollDownBtn) {
  scrollUpBtn.addEventListener('click', () => {
    cameraGrid.scrollBy({ top: -200, behavior: 'smooth' });
  });
  
  scrollDownBtn.addEventListener('click', () => {
    cameraGrid.scrollBy({ top: 200, behavior: 'smooth' });
  });
  
  // Show/hide buttons based on scroll position
  cameraGrid.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = cameraGrid;
    scrollUpBtn.style.display = scrollTop > 0 ? 'flex' : 'none';
    scrollDownBtn.style.display = scrollTop < scrollHeight - clientHeight ? 'flex' : 'none';
  });
}