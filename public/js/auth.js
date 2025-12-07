// Authentication Logic
import { auth } from './firebase-config.js';
import {
    signInWithPopup,
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Current user state
let currentUser = null;

// Auth State Observer
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateUIForAuth(user);
});

// Update UI based on auth state
function updateUIForAuth(user) {
    const userDisplayElements = document.querySelectorAll('.user-display');
    const loginButtons = document.querySelectorAll('.login-required');
    const logoutButtons = document.querySelectorAll('.logout-btn');

    // New nav buttons
    const navLoginBtn = document.querySelector('.btn-nav-login');
    const navLogoutBtn = document.querySelector('.btn-nav-logout');

    if (user) {
        // User is signed in
        console.log('✅ User signed in:', user.email);

        userDisplayElements.forEach(el => {
            el.textContent = user.email;
            el.style.display = 'block';
        });

        loginButtons.forEach(el => el.style.display = 'none');
        logoutButtons.forEach(el => el.style.display = 'block');

        // Show/hide nav buttons
        if (navLoginBtn) navLoginBtn.style.display = 'none';
        if (navLogoutBtn) navLogoutBtn.style.display = 'inline-block';

        // Dispatch custom event for other scripts
        window.dispatchEvent(new CustomEvent('userAuthenticated', { detail: user }));
    } else {
        // User is signed out
        console.log('⚠️ User signed out');

        userDisplayElements.forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });

        loginButtons.forEach(el => el.style.display = 'block');
        logoutButtons.forEach(el => el.style.display = 'none');

        // Show/hide nav buttons
        if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
        if (navLogoutBtn) navLogoutBtn.style.display = 'none';

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('userSignedOut'));
    }
}

// Email/Password Sign Up
window.signUpWithEmail = async function() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log('✅ Account created successfully');
        alert('Account created! Welcome!');
        window.location.href = '/ad-generator.html';
    } catch (error) {
        console.error('❌ Sign up error:', error);
        alert('Error: ' + error.message);
    }
};

// Email/Password Sign In
window.signInWithEmail = async function() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Signed in successfully');
        alert('Welcome back!');
        window.location.href = '/ad-generator.html';
    } catch (error) {
        console.error('❌ Sign in error:', error);
        alert('Error: ' + error.message);
    }
};

// Google Sign In
window.signInWithGoogle = async function() {
    const provider = new GoogleAuthProvider();

    try {
        const result = await signInWithPopup(auth, provider);
        console.log('✅ Google sign in successful');
        alert('Welcome!');
        window.location.href = '/ad-generator.html';
    } catch (error) {
        console.error('❌ Google sign in error:', error);
        alert('Error: ' + error.message);
    }
};

// Sign Out
window.signOutUser = async function() {
    if (!confirm('Are you sure you want to sign out?')) return;

    try {
        await signOut(auth);
        console.log('✅ Signed out successfully');
        alert('Signed out successfully');
        window.location.href = '/';
    } catch (error) {
        console.error('❌ Sign out error:', error);
        alert('Error: ' + error.message);
    }
};

// Get current user
window.getCurrentUser = function() {
    return currentUser;
};

// Check if user is authenticated (for protected pages)
window.requireAuth = function(redirectUrl = '/login.html') {
    if (!currentUser) {
        alert('Please sign in to access this page');
        window.location.href = redirectUrl;
        return false;
    }
    return true;
};

export { currentUser, updateUIForAuth };
