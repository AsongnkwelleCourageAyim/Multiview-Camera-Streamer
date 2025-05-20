// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOWDxK_mvAM-Y7Q5W3G6onUnS-uxS4nIw",
  authDomain: "multiview-video-streaming-app.firebaseapp.com",
  projectId: "multiview-video-streaming-app",
  storageBucket: "multiview-video-streaming-app.firebasestorage.app",
  messagingSenderId: "959539028042",
  appId: "1:959539028042:web:3f2d18a1f7fc26e1d586b3",
  measurementId: "G-N9VT5FDXWB"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };