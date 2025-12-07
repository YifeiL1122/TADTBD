import { auth, db, storage } from './firebase-config.js';
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    collection, 
    addDoc, 
    setDoc,
    doc,
    getDocs, 
    query, 
    orderBy, 
    where 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    ref, 
    uploadString, 
    getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Global State
let currentUser = null;
let currentTemplate = 'modern';
let currentLogoData = null;

// ==========================================
// ROUTING & AUTH
// ==========================================

window.router = function(viewName) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    // Show selected view
    const view = document.getElementById(`${viewName}-view`);
    if (view) view.style.display = 'block';

    // Update nav
    const navBtn = document.getElementById(`nav-${viewName}`);
    if (navBtn) navBtn.classList.add('active');

    // Special logic for Views
    if (viewName === 'ad-generator') {
        if (!currentUser) {
            alert("Please login to save your ads!");
            window.router('login');
            return;
        }
        loadSavedAds(); // Refresh ads when entering view
    }

    if (viewName === 'admin') {
        if (!currentUser) {
            alert("Please login to access Admin Dashboard!");
            window.router('login');
            return;
        }
        // Ideally check for admin role/claim here
        loadAllAds();
    }
};

window.handleLogout = function() {
    signOut(auth).then(() => {
        alert('Logged out successfully');
        window.router('login');
    }).catch((error) => {
        console.error('Logout error', error);
    });
};

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const userInfo = document.getElementById('user-info');
    const navLogin = document.getElementById('nav-login');
    const navLogout = document.getElementById('nav-logout');

    if (user) {
        // User is signed in
        console.log('User signed in:', user.email);
        userInfo.textContent = `Signed in as: ${user.email}`;
        navLogin.style.display = 'none';
        navLogout.style.display = 'inline-block';
        
        // Update Firebase Status in Ad Generator
        const fbStatus = document.getElementById('firebaseStatus');
        if(fbStatus) {
            fbStatus.textContent = '☁️ Connected';
            fbStatus.style.color = '#00D659';
        }
        
        loadSavedAds();
    } else {
        // User is signed out
        console.log('User signed out');
        userInfo.textContent = '';
        navLogin.style.display = 'inline-block';
        navLogout.style.display = 'none';
        
         const fbStatus = document.getElementById('firebaseStatus');
        if(fbStatus) {
            fbStatus.textContent = '⚠️ Not logged in';
            fbStatus.style.color = '#FF8C00';
        }
        
        // Clear saved ads list
        const list = document.getElementById('savedAdsList');
        if(list) list.innerHTML = '<p class="empty-message">Login to view saved ads</p>';
    }
});

// Login Handlers
document.addEventListener('DOMContentLoaded', () => {
    // Email Login
    document.getElementById('btn-login-email')?.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            window.router('ad-generator');
        } catch (e) {
            alert(e.message);
        }
    });

    // Email Signup
    document.getElementById('btn-signup-email')?.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        try {
            await createUserWithEmailAndPassword(auth, email, pass);
            alert("Account created! Welcome.");
            window.router('ad-generator');
        } catch (e) {
            alert(e.message);
        }
    });

    // Google Login
    document.getElementById('btn-login-google')?.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            window.router('ad-generator');
        } catch (e) {
            alert(e.message);
        }
    });
    
    // Initial Setup
    updateSlogan();
    updateDescription();
});


// ==========================================
// AD GENERATOR LOGIC
// ==========================================

window.selectTemplate = function(templateName) {
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
        selectedTemplate.style.display = 'flex'; // Modern uses flex center
        if (templateName === 'professional') {
             selectedTemplate.style.display = 'flex'; // Professional uses flex column
        }
    }

    // Update canvas class
    const adCanvas = document.getElementById('adCanvas');
    if (adCanvas) {
        adCanvas.className = `ad-canvas template-${templateName}`;
    }
    
    // Sync content
    syncTemplateContent();
};

window.selectColor = function(colorName) {
    console.log('Color selected:', colorName);
    document.documentElement.setAttribute('data-theme', colorName);
    
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    document.querySelector(`.color-option[data-color="${colorName}"]`)?.classList.add('active');
};

window.handleLogoUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        currentLogoData = event.target.result;
        
        // Preview sidebar
        const logoPlaceholder = document.getElementById('logoPlaceholder');
        const logoPreview = document.getElementById('logoPreview');
        if(logoPlaceholder) logoPlaceholder.style.display = 'none';
        if(logoPreview) {
            logoPreview.src = currentLogoData;
            logoPreview.style.display = 'block';
        }

        // Templates
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
    };
    reader.readAsDataURL(file);
};

window.updateSlogan = function() {
    const input = document.getElementById('sloganInput');
    const text = input?.value || 'Your Slogan Here';
    const length = input?.value.length || 0;

    const count = document.getElementById('sloganCount');
    if(count) count.textContent = length;

    document.getElementById('modernSlogan').textContent = text;
    document.getElementById('professionalSlogan').textContent = text;
};

window.updateDescription = function() {
    const input = document.getElementById('descriptionInput');
    const text = input?.value || 'Add your detailed description to bring your message to life.';
    const length = input?.value.length || 0;

    const count = document.getElementById('descCount');
    if(count) count.textContent = length;

    document.getElementById('modernDesc').textContent = text;
    document.getElementById('professionalDesc').textContent = text;
};

function syncTemplateContent() {
    window.updateSlogan();
    window.updateDescription();
    
    if (currentLogoData) {
        const modernLogo = document.getElementById('modernLogo');
        const professionalLogo = document.getElementById('professionalLogo');
        if(modernLogo) modernLogo.src = currentLogoData;
        if(professionalLogo) professionalLogo.src = currentLogoData;
    }
}

window.downloadAd = async function() {
    const btn = document.getElementById('downloadBtn');
    btn.textContent = 'Generating...';
    btn.disabled = true;

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

        const link = document.createElement('a');
        link.download = `tmobile-ad-${Date.now()}.png`;
        link.href = canvasImage.toDataURL('image/png');
        link.click();
        alert('Ad downloaded!');
    } catch (err) {
        console.error(err);
        alert('Error downloading ad');
    } finally {
        btn.textContent = 'Download Ad';
        btn.disabled = false;
    }
};

window.saveToFirebase = async function() {
    if (!currentUser) {
        alert("Please login first!");
        return;
    }

    const sloganInput = document.getElementById('sloganInput');
    if (!sloganInput || !sloganInput.value.trim()) {
        alert('Please enter a slogan!');
        return;
    }

    const btn = document.getElementById('saveToFirebaseBtn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

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

        // Storage Upload
        const timestamp = Date.now();
        const storageRef = ref(storage, `users/${currentUser.uid}/ads/${timestamp}.png`);
        await uploadString(storageRef, imageData, 'data_url');
        const imageUrl = await getDownloadURL(storageRef);

        // Firestore Save
        const adData = {
            userId: currentUser.uid,
            slogan: sloganInput.value,
            description: document.getElementById('descriptionInput').value,
            template: currentTemplate,
            logoData: currentLogoData,
            imageUrl: imageUrl,
            createdAt: new Date().toISOString(),
            timestamp: timestamp
        };

        await addDoc(collection(db, 'ads'), adData);
        alert('Saved successfully!');
        loadSavedAds();

    } catch (e) {
        console.error(e);
        alert('Error saving: ' + e.message);
    } finally {
        btn.textContent = 'Save to Cloud';
        btn.disabled = false;
    }
};

async function loadSavedAds() {
    if (!currentUser) return;
    
    const list = document.getElementById('savedAdsList');
    if(list) list.innerHTML = '<p class="empty-message">Loading...</p>';

    try {
        // Query ads for THIS user only
        const q = query(
            collection(db, 'ads'), 
            where("userId", "==", currentUser.uid),
            orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            if(list) list.innerHTML = '<p class="empty-message">No saved ads found.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.createdAt).toLocaleDateString();
            const safeData = JSON.stringify(data).replace(/"/g, '&quot;');
            
            html += `
                <div class="saved-ad-item" onclick='window.loadAdData(${safeData})'>
                    <div class="saved-ad-title">${data.slogan || 'Untitled'}</div>
                    <div class="saved-ad-date">${date}</div>
                </div>
            `;
        });
        if(list) list.innerHTML = html;

    } catch (e) {
        console.error(e);
        if(list) {
            if (e.code === 'failed-precondition') {
                 list.innerHTML = '<p class="empty-message">Index required. Check console.</p>';
            } else {
                 list.innerHTML = '<p class="empty-message">Error loading ads.</p>';
            }
        }
    }
}

// ==========================================
// ADMIN LOGIC
// ==========================================

async function loadAllAds() {
    const grid = document.getElementById('adminAdsGrid');
    if(!grid) return;
    grid.innerHTML = '<p class="empty-message">Loading all community ads...</p>';

    try {
        // Load ALL ads (no userId filter)
        const q = query(collection(db, 'ads'), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            grid.innerHTML = '<p class="empty-message">No ads found in system.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.createdAt).toLocaleDateString();
            const safeData = JSON.stringify(data).replace(/"/g, '&quot;');
            
            // Create Ad Card
            html += `
                <div class="ad-card">
                    <div class="ad-card-image" style="background-image: url('${data.imageUrl}'); background-size: cover; background-position: center;"></div>
                    <div class="ad-card-content">
                        <div class="ad-card-title">${data.slogan || 'Untitled'}</div>
                        <div class="ad-card-desc">${data.description || 'No description'}</div>
                        <div class="ad-card-meta">
                            <span>${date}</span>
                            <span>Template: ${data.template}</span>
                        </div>
                        <div class="ad-card-actions">
                            <button class="btn-primary" onclick='window.launchToESP32("${data.imageUrl}", ${safeData})' style="width: 100%;">
                                🚀 Launch to ESP32
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;

    } catch (e) {
        console.error("Admin Load Error", e);
        grid.innerHTML = '<p class="empty-message">Error loading ads (Index might be missing).</p>';
    }
}

window.launchToESP32 = async function(imageUrl, adData) {
    if(!confirm(`Launch "${adData.slogan}" to ESP32 Display?`)) return;
    
    const statusDiv = document.getElementById('adminStatus');
    statusDiv.textContent = "🚀 Launching...";
    statusDiv.style.color = "#E20074";

    try {
        // Write to a specific document that ESP32 listens to
        // Structure: collection 'display_config', document 'main_display'
        await setDoc(doc(db, "display_config", "main_display"), {
            imageUrl: imageUrl,
            slogan: adData.slogan,
            description: adData.description,
            updatedAt: new Date().toISOString(),
            status: 'active',
            launchedBy: currentUser.email
        });

        statusDiv.textContent = "✅ Successfully Deployed to ESP32";
        statusDiv.style.color = "#00D659";
        
        setTimeout(() => {
             statusDiv.textContent = "Connected to ESP32 Control";
             statusDiv.style.color = "#666";
        }, 3000);

    } catch (e) {
        console.error("Launch Error", e);
        alert("Failed to launch: " + e.message);
        statusDiv.textContent = "❌ Launch Failed";
    }
};

window.loadAdData = function(data) {
    document.getElementById('sloganInput').value = data.slogan || '';
    document.getElementById('descriptionInput').value = data.description || '';
    
    if (data.logoData) {
        currentLogoData = data.logoData;
        const logoPreview = document.getElementById('logoPreview');
        const logoPlaceholder = document.getElementById('logoPlaceholder');
        if(logoPlaceholder) logoPlaceholder.style.display = 'none';
        if(logoPreview) {
            logoPreview.src = currentLogoData;
            logoPreview.style.display = 'block';
        }
    }
    
    window.selectTemplate(data.template || 'modern');
    window.updateSlogan();
    window.updateDescription();
};

window.resetForm = function() {
    if(!confirm("Clear everything?")) return;
    document.getElementById('sloganInput').value = '';
    document.getElementById('descriptionInput').value = '';
    document.getElementById('logoInput').value = '';
    currentLogoData = null;
    
    document.getElementById('logoPlaceholder').style.display = 'flex';
    document.getElementById('logoPreview').style.display = 'none';
    
    const modernLogo = document.getElementById('modernLogo');
    if(modernLogo) {
        modernLogo.src = '';
        modernLogo.style.display = 'none';
    }
    
    const professionalLogo = document.getElementById('professionalLogo');
    if(professionalLogo) {
        professionalLogo.src = '';
        professionalLogo.style.display = 'none';
    }

    window.updateSlogan();
    window.updateDescription();
};
