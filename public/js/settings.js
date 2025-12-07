// Settings Page Logic
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        window.location.href = '/login.html';
    } else {
        document.getElementById('userEmail').textContent = user.email;
        loadSettings();
    }
});

// Load user settings
async function loadSettings() {
    if (!currentUser) return;

    try {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Populate form fields
            if (data.businessName) document.getElementById('businessName').value = data.businessName;
            if (data.businessType) document.getElementById('businessType').value = data.businessType;
            if (data.businessDescription) document.getElementById('businessDescription').value = data.businessDescription;
            if (data.storeAddress) document.getElementById('storeAddress').value = data.storeAddress;
            if (data.city) document.getElementById('city').value = data.city;
            if (data.state) document.getElementById('state').value = data.state;
            if (data.zipcode) document.getElementById('zipcode').value = data.zipcode;

            console.log('✅ Settings loaded');
        } else {
            console.log('ℹ️ No settings found, showing empty form');
        }

    } catch (error) {
        console.error('❌ Error loading settings:', error);
        alert('Error loading settings: ' + error.message);
    }
}

// Save user settings
window.saveSettings = async function() {
    if (!currentUser) {
        alert('Please sign in to save settings');
        return;
    }

    // Get form values
    const settings = {
        businessName: document.getElementById('businessName').value.trim(),
        businessType: document.getElementById('businessType').value,
        businessDescription: document.getElementById('businessDescription').value.trim(),
        storeAddress: document.getElementById('storeAddress').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value,
        zipcode: document.getElementById('zipcode').value.trim(),
        updatedAt: new Date().toISOString()
    };

    // Validation
    if (!settings.businessName || !settings.businessType || !settings.storeAddress ||
        !settings.city || !settings.state || !settings.zipcode) {
        alert('Please fill in all required fields');
        return;
    }

    if (!/^\d{5}$/.test(settings.zipcode)) {
        alert('Please enter a valid 5-digit ZIP code');
        return;
    }

    try {
        const docRef = doc(db, 'users', currentUser.uid);

        // Check if document exists
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Update existing document
            await updateDoc(docRef, settings);
        } else {
            // Create new document
            await setDoc(docRef, {
                ...settings,
                userId: currentUser.uid,
                userEmail: currentUser.email,
                createdAt: new Date().toISOString()
            });
        }

        console.log('✅ Settings saved successfully');
        alert('Settings saved successfully!');

    } catch (error) {
        console.error('❌ Error saving settings:', error);
        alert('Error saving settings: ' + error.message);
    }
};
