// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

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
let app, db, storage;
let firebaseInitialized = false;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    firebaseInitialized = true;
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.warn('⚠️ Firebase not configured. Running in local mode.', error);
}

// Global State
let currentTemplate = 'modern';
let currentLogoData = null;

// Wait for DOM to be fully loaded
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Starting initialization...');

    // Small delay to ensure everything is loaded
    setTimeout(function() {
        initializeApp();
    }, 100);
});

function initializeApp() {
    console.log('📝 Initializing app...');

    // Setup event listeners
    setupEventListeners();

    // Initialize display
    updateSlogan();
    updateDescription();

    // Load saved ads if Firebase is ready
    if (firebaseInitialized) {
        loadSavedAds();
    }

    console.log('✅ App initialized successfully!');
}

function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');

    // Template selection
    const templateOptions = document.querySelectorAll('.template-option');
    templateOptions.forEach(option => {
        option.addEventListener('click', function() {
            selectTemplate(this.dataset.template);
        });
    });
    console.log(`✓ Template listeners: ${templateOptions.length}`);

    // Logo upload
    const logoInput = document.getElementById('logoInput');
    const logoUploadArea = document.getElementById('logoUploadArea');

    if (logoInput) {
        logoInput.addEventListener('change', handleLogoUpload);
        console.log('✓ Logo input listener attached');
    }

    if (logoUploadArea) {
        logoUploadArea.addEventListener('click', function() {
            logoInput.click();
        });
        console.log('✓ Logo upload area listener attached');
    }

    // Slogan input - CRITICAL FIX
    const sloganInput = document.getElementById('sloganInput');
    if (sloganInput) {
        // Use both 'input' and 'keyup' events for better coverage
        sloganInput.addEventListener('input', function(e) {
            console.log('✏️ Slogan input event:', e.target.value);
            updateSlogan();
        });

        sloganInput.addEventListener('keyup', function(e) {
            console.log('⌨️ Slogan keyup event:', e.target.value);
            updateSlogan();
        });

        console.log('✓ Slogan input listeners attached');
    } else {
        console.error('❌ sloganInput element NOT FOUND!');
    }

    // Description input - CRITICAL FIX
    const descriptionInput = document.getElementById('descriptionInput');
    if (descriptionInput) {
        descriptionInput.addEventListener('input', function(e) {
            console.log('✏️ Description input event:', e.target.value);
            updateDescription();
        });

        descriptionInput.addEventListener('keyup', function(e) {
            console.log('⌨️ Description keyup event:', e.target.value);
            updateDescription();
        });

        console.log('✓ Description input listeners attached');
    } else {
        console.error('❌ descriptionInput element NOT FOUND!');
    }

    // Buttons
    const downloadBtn = document.getElementById('downloadBtn');
    const saveToFirebaseBtn = document.getElementById('saveToFirebaseBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadAd);
        console.log('✓ Download button listener attached');
    }

    if (saveToFirebaseBtn) {
        saveToFirebaseBtn.addEventListener('click', saveToFirebase);
        console.log('✓ Save to Firebase button listener attached');
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetForm);
        console.log('✓ Reset button listener attached');
    }

    console.log('✅ All event listeners setup complete!');
}

// Template Selection
function selectTemplate(templateName) {
    console.log('🎨 Switching to template:', templateName);
    currentTemplate = templateName;

    // Update UI
    document.querySelectorAll('.template-option').forEach(opt => {
        opt.classList.remove('active');
    });

    const activeOption = document.querySelector(`[data-template="${templateName}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }

    // Show selected template
    document.querySelectorAll('.template').forEach(template => {
        template.style.display = 'none';
    });

    const selectedTemplate = document.querySelector(`.${templateName}-template`);
    if (selectedTemplate) {
        selectedTemplate.style.display = 'flex';
    }

    // Update canvas class
    const adCanvas = document.getElementById('adCanvas');
    if (adCanvas) {
        adCanvas.className = `ad-canvas template-${templateName}`;
    }

    // Sync content
    syncTemplateContent();
}

// Logo Upload Handler
function handleLogoUpload(e) {
    console.log('📸 Logo upload triggered');
    const file = e.target.files[0];
    if (!file) {
        console.log('⚠️ No file selected');
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file!');
        return;
    }

    console.log('📷 Processing image:', file.name);
    const reader = new FileReader();
    reader.onload = function(event) {
        currentLogoData = event.target.result;
        console.log('✅ Logo loaded successfully');

        // Show preview in sidebar
        const logoPlaceholder = document.getElementById('logoPlaceholder');
        const logoPreview = document.getElementById('logoPreview');

        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        if (logoPreview) {
            logoPreview.src = currentLogoData;
            logoPreview.style.display = 'block';
        }

        // Update both templates
        const modernLogo = document.getElementById('modernLogo');
        const professionalLogo = document.getElementById('professionalLogo');

        if (modernLogo) modernLogo.src = currentLogoData;
        if (professionalLogo) professionalLogo.src = currentLogoData;

        console.log('✅ Logo updated in all templates');
    };
    reader.readAsDataURL(file);
}

// Update Slogan - SIMPLIFIED AND FIXED
function updateSlogan() {
    const sloganInput = document.getElementById('sloganInput');
    const sloganCount = document.getElementById('sloganCount');
    const modernSlogan = document.getElementById('modernSlogan');
    const professionalSlogan = document.getElementById('professionalSlogan');

    if (!sloganInput) {
        console.error('❌ sloganInput element not found!');
        return;
    }

    const text = sloganInput.value || 'Your Slogan Here';
    const length = sloganInput.value.length;

    console.log('📝 Updating slogan:', text, '(length:', length, ')');

    // Update character count
    if (sloganCount) {
        sloganCount.textContent = length;
        console.log('✓ Updated count to:', length);
    }

    // Update both templates
    if (modernSlogan) {
        modernSlogan.textContent = text;
        console.log('✓ Updated modern slogan');
    }

    if (professionalSlogan) {
        professionalSlogan.textContent = text;
        console.log('✓ Updated professional slogan');
    }
}

// Update Description - SIMPLIFIED AND FIXED
function updateDescription() {
    const descriptionInput = document.getElementById('descriptionInput');
    const descCount = document.getElementById('descCount');
    const modernDesc = document.getElementById('modernDesc');
    const professionalDesc = document.getElementById('professionalDesc');

    if (!descriptionInput) {
        console.error('❌ descriptionInput element not found!');
        return;
    }

    const text = descriptionInput.value || 'Add your detailed description to bring your message to life.';
    const length = descriptionInput.value.length;

    console.log('📝 Updating description:', text.substring(0, 30) + '...', '(length:', length, ')');

    // Update character count
    if (descCount) {
        descCount.textContent = length;
        console.log('✓ Updated count to:', length);
    }

    // Update both templates
    if (modernDesc) {
        modernDesc.textContent = text;
        console.log('✓ Updated modern description');
    }

    if (professionalDesc) {
        professionalDesc.textContent = text;
        console.log('✓ Updated professional description');
    }
}

// Sync content when switching templates
function syncTemplateContent() {
    console.log('🔄 Syncing template content...');
    updateSlogan();
    updateDescription();

    if (currentLogoData) {
        const modernLogo = document.getElementById('modernLogo');
        const professionalLogo = document.getElementById('professionalLogo');

        if (modernLogo) modernLogo.src = currentLogoData;
        if (professionalLogo) professionalLogo.src = currentLogoData;
    }
}

// Download Ad
async function downloadAd() {
    console.log('⬇️ Starting download...');
    const downloadBtn = document.getElementById('downloadBtn');

    try {
        // Show loading state
        if (downloadBtn) {
            downloadBtn.textContent = 'Generating...';
            downloadBtn.disabled = true;
        }

        // Import html2canvas dynamically
        const html2canvas = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');

        const canvas = document.getElementById('adCanvas');
        const canvasImage = await html2canvas.default(canvas, {
            backgroundColor: null,
            scale: 2,
            width: 240,
            height: 320,
            useCORS: true,
            allowTaint: true
        });

        // Download
        const link = document.createElement('a');
        link.download = `tmobile-ad-${Date.now()}.png`;
        link.href = canvasImage.toDataURL('image/png');
        link.click();

        console.log('✅ Download successful!');
        alert('Ad downloaded successfully!');

    } catch (error) {
        console.error('❌ Download error:', error);
        alert('Failed to download ad. Please try again.');
    } finally {
        // Reset button
        if (downloadBtn) {
            downloadBtn.innerHTML = `
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Ad
            `;
            downloadBtn.disabled = false;
        }
    }
}

// Save to Firebase
async function saveToFirebase() {
    if (!firebaseInitialized) {
        alert('Firebase is not configured. Please check the configuration in ad-generator.js');
        return;
    }

    const sloganInput = document.getElementById('sloganInput');
    if (!sloganInput || !sloganInput.value.trim()) {
        alert('Please enter a slogan before saving!');
        return;
    }

    console.log('☁️ Saving to Firebase...');
    const saveToFirebaseBtn = document.getElementById('saveToFirebaseBtn');

    try {
        if (saveToFirebaseBtn) {
            saveToFirebaseBtn.textContent = 'Saving...';
            saveToFirebaseBtn.disabled = true;
        }

        // Generate canvas image
        const html2canvas = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
        const canvas = document.getElementById('adCanvas');
        const canvasImage = await html2canvas.default(canvas, {
            backgroundColor: null,
            scale: 2,
            width: 240,
            height: 320,
            useCORS: true,
            allowTaint: true
        });

        const imageData = canvasImage.toDataURL('image/png');

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const storageRef = ref(storage, `ads/${timestamp}.png`);
        await uploadString(storageRef, imageData, 'data_url');
        const imageUrl = await getDownloadURL(storageRef);

        // Save metadata to Firestore
        const descriptionInput = document.getElementById('descriptionInput');
        const adData = {
            slogan: sloganInput.value,
            description: descriptionInput ? descriptionInput.value : '',
            template: currentTemplate,
            logoData: currentLogoData,
            imageUrl: imageUrl,
            createdAt: new Date().toISOString(),
            timestamp: timestamp
        };

        await addDoc(collection(db, 'ads'), adData);

        console.log('✅ Saved to Firebase successfully!');
        alert('Ad saved to cloud successfully!');
        loadSavedAds();

    } catch (error) {
        console.error('❌ Save error:', error);
        alert('Failed to save ad. Please try again.');
    } finally {
        if (saveToFirebaseBtn) {
            saveToFirebaseBtn.innerHTML = `
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                Save to Cloud
            `;
            saveToFirebaseBtn.disabled = false;
        }
    }
}

// Load Saved Ads from Firebase
async function loadSavedAds() {
    if (!firebaseInitialized) return;

    console.log('📂 Loading saved ads...');
    const savedAdsList = document.getElementById('savedAdsList');
    if (!savedAdsList) return;

    try {
        const q = query(collection(db, 'ads'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            savedAdsList.innerHTML = '<p class="empty-message">No saved ads yet</p>';
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = new Date(data.createdAt).toLocaleDateString('en-US');

            html += `
                <div class="saved-ad-item" onclick="loadAd('${doc.id}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
                    <div class="saved-ad-title">${data.slogan || 'Untitled'}</div>
                    <div class="saved-ad-date">${date}</div>
                </div>
            `;
        });

        savedAdsList.innerHTML = html;
        console.log('✅ Loaded saved ads successfully');
    } catch (error) {
        console.error('❌ Error loading saved ads:', error);
    }
}

// Load Ad
window.loadAd = function(id, data) {
    console.log('📥 Loading ad:', id);

    const sloganInput = document.getElementById('sloganInput');
    const descriptionInput = document.getElementById('descriptionInput');

    // Restore form values
    if (sloganInput) sloganInput.value = data.slogan || '';
    if (descriptionInput) descriptionInput.value = data.description || '';

    // Restore logo
    if (data.logoData) {
        currentLogoData = data.logoData;
        const logoPlaceholder = document.getElementById('logoPlaceholder');
        const logoPreview = document.getElementById('logoPreview');

        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        if (logoPreview) {
            logoPreview.src = currentLogoData;
            logoPreview.style.display = 'block';
        }
    }

    // Select template
    selectTemplate(data.template || 'modern');

    // Update preview
    updateSlogan();
    updateDescription();
};

// Reset Form
function resetForm() {
    if (!confirm('Are you sure you want to reset? All unsaved changes will be lost.')) {
        return;
    }

    console.log('🔄 Resetting form...');

    const sloganInput = document.getElementById('sloganInput');
    const descriptionInput = document.getElementById('descriptionInput');
    const logoInput = document.getElementById('logoInput');
    const logoPlaceholder = document.getElementById('logoPlaceholder');
    const logoPreview = document.getElementById('logoPreview');

    if (sloganInput) sloganInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (logoInput) logoInput.value = '';

    currentLogoData = null;

    if (logoPlaceholder) logoPlaceholder.style.display = 'flex';
    if (logoPreview) logoPreview.style.display = 'none';

    const modernLogo = document.getElementById('modernLogo');
    const professionalLogo = document.getElementById('professionalLogo');

    if (modernLogo) modernLogo.src = '';
    if (professionalLogo) professionalLogo.src = '';

    updateSlogan();
    updateDescription();

    console.log('✅ Form reset complete');
}
