// Ad Generator Logic with Firebase Integration
import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    ref,
    uploadString,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Import auth.js for shared auth functionality
import './auth.js';

// Global State
let currentTemplate = 'modern';
let currentLogoData = null;
let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthStatus(user);
    if (user) {
        loadSavedAds();
    }
});

// Update auth status display
function updateAuthStatus(user) {
    const authStatus = document.getElementById('authStatus');
    if (!authStatus) return;

    if (user) {
        authStatus.className = 'auth-status';
        authStatus.innerHTML = `<strong>✅ Signed in as:</strong> ${user.email}`;
    } else {
        authStatus.className = 'auth-status not-logged-in';
        authStatus.innerHTML = '<strong>⚠️ Not logged in</strong> - <a href="/login.html" style="color: var(--warning-orange); text-decoration: underline;">Sign in</a> to save your ads to the cloud';
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Ad Generator initialized');
    updateSlogan();
    updateDescription();
});

// Select Template
window.selectTemplate = function(templateName) {
    console.log('🎨 Switching to template:', templateName);
    currentTemplate = templateName;

    // Update UI
    document.querySelectorAll('.template-option').forEach(opt => {
        opt.classList.remove('active');
    });
    document.querySelector(`[data-template="${templateName}"]`)?.classList.add('active');

    // Show/hide templates
    document.getElementById('modernTemplate').style.display =
        templateName === 'modern' ? 'flex' : 'none';
    document.getElementById('professionalTemplate').style.display =
        templateName === 'professional' ? 'flex' : 'none';

    console.log('✅ Template switched to:', templateName);
};

// Select Color
window.selectColor = function(colorName) {
    console.log('🎨 Color selected:', colorName);
    document.documentElement.setAttribute('data-theme', colorName);

    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    document.querySelector(`.color-option[data-color="${colorName}"]`)?.classList.add('active');
};

// Handle Logo Upload
window.handleLogoUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        currentLogoData = e.target.result;

        // Show in sidebar
        document.getElementById('logoPlaceholder').style.display = 'none';
        const preview = document.getElementById('logoPreview');
        preview.src = currentLogoData;
        preview.style.display = 'block';

        // Show in templates
        const modernLogo = document.getElementById('modernLogo');
        const professionalLogo = document.getElementById('professionalLogo');

        modernLogo.src = currentLogoData;
        modernLogo.style.display = 'block';
        professionalLogo.src = currentLogoData;
        professionalLogo.style.display = 'block';

        console.log('✅ Logo uploaded successfully');
    };
    reader.readAsDataURL(file);
};

// Update Ad Name Count
window.updateNameCount = function() {
    const input = document.getElementById('adNameInput');
    const count = document.getElementById('nameCount');
    const length = input?.value.length || 0;
    if (count) count.textContent = length;
};

// Update Slogan
window.updateSlogan = function() {
    const input = document.getElementById('sloganInput');
    const count = document.getElementById('sloganCount');
    const modernSlogan = document.getElementById('modernSlogan');
    const professionalSlogan = document.getElementById('professionalSlogan');

    const text = input?.value || 'Your Slogan Here';
    const length = input?.value.length || 0;

    if (count) count.textContent = length;
    if (modernSlogan) modernSlogan.textContent = text;
    if (professionalSlogan) professionalSlogan.textContent = text;
};

// Update Description
window.updateDescription = function() {
    const input = document.getElementById('descriptionInput');
    const count = document.getElementById('descCount');
    const modernDesc = document.getElementById('modernDesc');
    const professionalDesc = document.getElementById('professionalDesc');

    const text = input?.value || 'Add your detailed description to bring your message to life.';
    const length = input?.value.length || 0;

    if (count) count.textContent = length;
    if (modernDesc) modernDesc.textContent = text;
    if (professionalDesc) professionalDesc.textContent = text;
};

// Download Ad
window.downloadAd = function() {
    console.log('⬇️ Starting download...');
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.textContent = 'Generating...';
    downloadBtn.disabled = true;

    const canvas = document.getElementById('adCanvas');

    html2canvas(canvas, {
        backgroundColor: null,
        scale: 2,
        width: 240,
        height: 320,
        useCORS: true,
        allowTaint: true
    }).then(function(canvasImage) {
        const link = document.createElement('a');
        link.download = 'tmobile-ad-' + Date.now() + '.png';
        link.href = canvasImage.toDataURL('image/png');
        link.click();

        downloadBtn.textContent = 'Download Ad';
        downloadBtn.disabled = false;

        console.log('✅ Download successful!');
        alert('Ad downloaded successfully!');
    }).catch(function(error) {
        console.error('❌ Download error:', error);
        alert('Failed to download ad. Please try again.');
        downloadBtn.disabled = false;
    });
};

// Save to Firebase
window.saveToFirebase = async function() {
    if (!currentUser) {
        alert('Please sign in to save your ads to the cloud!');
        window.location.href = '/login.html';
        return;
    }

    const sloganInput = document.getElementById('sloganInput');
    if (!sloganInput?.value.trim()) {
        alert('Please enter a slogan before saving!');
        return;
    }

    console.log('☁️ Saving to Firebase...');
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        const canvas = document.getElementById('adCanvas');
        const canvasImage = await html2canvas(canvas, {
            backgroundColor: null,
            scale: 2,
            width: 240,
            height: 320,
            useCORS: true,
            allowTaint: true
        });

        const imageData = canvasImage.toDataURL('image/png');
        const timestamp = Date.now();

        // Upload to Firebase Storage (user-specific path)
        const storageRef = ref(storage, `users/${currentUser.uid}/ads/${timestamp}.png`);
        await uploadString(storageRef, imageData, 'data_url');
        const imageUrl = await getDownloadURL(storageRef);

        // Save metadata to Firestore
        const adName = document.getElementById('adNameInput')?.value.trim() || 'Untitled Ad';

        await addDoc(collection(db, 'ads'), {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            name: adName,
            slogan: sloganInput.value,
            description: document.getElementById('descriptionInput').value,
            template: currentTemplate,
            logoData: currentLogoData,
            imageUrl: imageUrl,
            createdAt: new Date().toISOString(),
            timestamp: timestamp
        });

        saveBtn.textContent = 'Save to Cloud';
        saveBtn.disabled = false;

        console.log('✅ Saved to Firebase successfully!');
        alert('Ad saved to cloud successfully!');
        loadSavedAds();

    } catch (error) {
        console.error('❌ Save error:', error);
        alert('Failed to save ad: ' + error.message);
        saveBtn.textContent = 'Save to Cloud';
        saveBtn.disabled = false;
    }
};

// Load Saved Ads (user-specific)
async function loadSavedAds() {
    if (!currentUser) {
        document.getElementById('savedAdsList').innerHTML =
            '<p class="empty-message">Sign in to view saved ads</p>';
        return;
    }

    const list = document.getElementById('savedAdsList');
    list.innerHTML = '<p class="empty-message">Loading...</p>';

    try {
        // Query ads for current user only
        const q = query(
            collection(db, 'ads'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            list.innerHTML = '<p class="empty-message">No saved ads yet</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.createdAt).toLocaleDateString();
            const safeData = JSON.stringify(data).replace(/"/g, '&quot;');

            html += `
                <div class="saved-ad-item" onclick='loadAd(${safeData})'>
                    <div class="saved-ad-title">${data.slogan || 'Untitled'}</div>
                    <div class="saved-ad-date">${date}</div>
                </div>
            `;
        });

        list.innerHTML = html;
        console.log('✅ Loaded saved ads successfully');

    } catch (error) {
        console.error('❌ Error loading saved ads:', error);
        if (error.code === 'failed-precondition') {
            list.innerHTML = '<p class="empty-message">Database index required. Please contact support.</p>';
        } else {
            list.innerHTML = '<p class="empty-message">Error loading ads</p>';
        }
    }
}

// Load Ad
window.loadAd = function(data) {
    console.log('📥 Loading ad...');

    document.getElementById('sloganInput').value = data.slogan || '';
    document.getElementById('descriptionInput').value = data.description || '';

    if (data.logoData) {
        currentLogoData = data.logoData;
        const logoPreview = document.getElementById('logoPreview');
        const logoPlaceholder = document.getElementById('logoPlaceholder');

        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        if (logoPreview) {
            logoPreview.src = currentLogoData;
            logoPreview.style.display = 'block';
        }

        const modernLogo = document.getElementById('modernLogo');
        const professionalLogo = document.getElementById('professionalLogo');
        if (modernLogo) {
            modernLogo.src = currentLogoData;
            modernLogo.style.display = 'block';
        }
        if (professionalLogo) {
            professionalLogo.src = currentLogoData;
            professionalLogo.style.display = 'block';
        }
    }

    selectTemplate(data.template || 'modern');
    updateSlogan();
    updateDescription();
};

// Reset Form
window.resetForm = function() {
    if (!confirm('Are you sure you want to reset? All unsaved changes will be lost.')) {
        return;
    }

    document.getElementById('sloganInput').value = '';
    document.getElementById('descriptionInput').value = '';
    document.getElementById('logoInput').value = '';

    document.getElementById('logoPlaceholder').style.display = 'flex';
    document.getElementById('logoPreview').style.display = 'none';

    const modernLogo = document.getElementById('modernLogo');
    const professionalLogo = document.getElementById('professionalLogo');

    if (modernLogo) {
        modernLogo.src = '';
        modernLogo.style.display = 'none';
    }
    if (professionalLogo) {
        professionalLogo.src = '';
        professionalLogo.style.display = 'none';
    }

    currentLogoData = null;

    updateSlogan();
    updateDescription();

    console.log('✅ Form reset complete');
};
