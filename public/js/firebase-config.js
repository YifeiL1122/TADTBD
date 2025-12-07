// Firebase Configuration and Initialization
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyB1OFLCXnfwxm4Fm3TjEpDpTK68Dv5ww10",
    authDomain: "tadtbd.firebaseapp.com",
    databaseURL: "https://tadtbd-default-rtdb.firebaseio.com",
    projectId: "tadtbd",
    storageBucket: "tadtbd.firebasestorage.app",
    messagingSenderId: "646836878345",
    appId: "1:646836878345:web:49cd49363c525387cf4cd8",
    measurementId: "G-G46P9895LW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

console.log('✅ Firebase initialized successfully');

export { app, auth, db, storage };
