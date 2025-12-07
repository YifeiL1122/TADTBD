// T-Mobile Advertisement Management System
// Local Storage Keys
const STORAGE_KEY = 'tmobile_ads';

// Global State
let ads = [];
let currentImage = null;
let editingAdId = null;

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    loadAdsFromStorage();
    initializeEventListeners();
    renderAds();
});

// Initialize Event Listeners
function initializeEventListeners() {
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // File Upload
    const fileInput = document.getElementById('fileInput');
    const uploadBox = document.getElementById('uploadBox');

    fileInput.addEventListener('change', handleFileSelect);

    // Drag and Drop
    uploadBox.addEventListener('dragover', handleDragOver);
    uploadBox.addEventListener('dragleave', handleDragLeave);
    uploadBox.addEventListener('drop', handleDrop);
    uploadBox.addEventListener('click', () => fileInput.click());

    // Form Inputs - Update Preview
    document.getElementById('adTitle').addEventListener('input', updatePreview);
    document.getElementById('adDescription').addEventListener('input', updatePreview);
    document.getElementById('adDuration').addEventListener('input', updatePreview);

    // Save and Cancel Buttons
    document.getElementById('saveAdBtn').addEventListener('click', saveAd);
    document.getElementById('cancelBtn').addEventListener('click', resetForm);

    // Edit Modal
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.querySelector('.close').addEventListener('click', closeEditModal);
    document.querySelector('.view-close').addEventListener('click', closeViewModal);

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        const editModal = document.getElementById('editModal');
        const viewModal = document.getElementById('viewModal');
        if (e.target === editModal) closeEditModal();
        if (e.target === viewModal) closeViewModal();
    });

    // Search and Sort
    document.getElementById('searchInput').addEventListener('input', filterAds);
    document.getElementById('sortSelect').addEventListener('change', filterAds);
}

// Tab Switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    // Render ads when switching to current or history tabs
    if (tabName === 'current' || tabName === 'history') {
        renderAds();
    }
}

// File Upload Handlers
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    } else {
        alert('Please select a valid image file!');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    } else {
        alert('Please select a valid image file!');
    }
}

function processImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        currentImage = e.target.result;
        showPreview();
    };
    reader.readAsDataURL(file);
}

// Preview Functions
function showPreview() {
    const previewSection = document.getElementById('previewSection');
    const previewImage = document.getElementById('previewImage');

    previewImage.src = currentImage;
    previewSection.style.display = 'block';
    updatePreview();

    // Scroll to preview
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updatePreview() {
    if (!currentImage) return;

    const title = document.getElementById('adTitle').value || 'Untitled Ad';
    const description = document.getElementById('adDescription').value || 'No description';
    const duration = document.getElementById('adDuration').value || '10';

    document.getElementById('previewTitle').textContent = title;
    document.getElementById('previewDesc').textContent = description;
    document.getElementById('previewDuration').textContent = duration;
}

function resetForm() {
    document.getElementById('adTitle').value = '';
    document.getElementById('adDescription').value = '';
    document.getElementById('adDuration').value = '10';
    document.getElementById('fileInput').value = '';
    document.getElementById('previewSection').style.display = 'none';
    currentImage = null;
}

// Save Ad
function saveAd() {
    if (!currentImage) {
        alert('Please upload an image first!');
        return;
    }

    const title = document.getElementById('adTitle').value.trim();
    if (!title) {
        alert('Please enter an ad title!');
        return;
    }

    const newAd = {
        id: Date.now(),
        title: title,
        description: document.getElementById('adDescription').value.trim(),
        duration: parseInt(document.getElementById('adDuration').value) || 10,
        image: currentImage,
        createdAt: new Date().toISOString(),
        active: true
    };

    ads.unshift(newAd);
    saveAdsToStorage();
    resetForm();

    // Show success message
    alert('Ad saved successfully!');

    // Switch to current ads tab
    document.querySelector('[data-tab="current"]').click();
}

// Local Storage Functions
function saveAdsToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ads));
}

function loadAdsFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        ads = JSON.parse(stored);
    }
}

// Render Ads
function renderAds() {
    renderCurrentAds();
    renderHistoryAds();
}

function renderCurrentAds() {
    const grid = document.getElementById('currentAdsGrid');
    const activeAds = ads.filter(ad => ad.active);

    if (activeAds.length === 0) {
        grid.innerHTML = '<p class="empty-message">No active ads</p>';
        return;
    }

    grid.innerHTML = activeAds.map(ad => createAdCard(ad, true)).join('');
    attachCardEventListeners();
}

function renderHistoryAds() {
    const grid = document.getElementById('historyAdsGrid');
    const inactiveAds = ads.filter(ad => !ad.active);

    if (inactiveAds.length === 0) {
        grid.innerHTML = '<p class="empty-message">No archived ads</p>';
        return;
    }

    grid.innerHTML = inactiveAds.map(ad => createAdCard(ad, false)).join('');
    attachCardEventListeners();
}

function createAdCard(ad, isCurrent) {
    const date = new Date(ad.createdAt).toLocaleString('en-US');
    const statusClass = ad.active ? 'active' : 'inactive';
    const statusText = ad.active ? 'Active' : 'Inactive';
    const toggleText = ad.active ? 'Deactivate' : 'Activate';

    return `
        <div class="ad-card" data-id="${ad.id}">
            <img src="${ad.image}" alt="${ad.title}" class="ad-card-image" onclick="viewAd(${ad.id})">
            <div class="ad-card-content">
                <h3 class="ad-card-title">${ad.title}</h3>
                <p class="ad-card-desc">${ad.description || 'No description'}</p>
                <div class="ad-card-meta">
                    <span>${date}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="ad-card-meta">
                    <span>Duration: ${ad.duration}s</span>
                </div>
                <div class="ad-card-actions">
                    <button class="edit-btn" onclick="editAd(${ad.id})">Edit</button>
                    <button class="toggle-btn" onclick="toggleAdStatus(${ad.id})">${toggleText}</button>
                    <button class="delete-btn" onclick="deleteAd(${ad.id})">Delete</button>
                </div>
            </div>
        </div>
    `;
}

function attachCardEventListeners() {
    // Event listeners are attached via onclick in HTML for simplicity
}

// View Ad in Modal
function viewAd(id) {
    const ad = ads.find(a => a.id === id);
    if (!ad) return;

    document.getElementById('viewImage').src = ad.image;
    document.getElementById('viewTitle').textContent = ad.title;
    document.getElementById('viewDescription').textContent = ad.description || 'No description';
    document.getElementById('viewDuration').textContent = ad.duration;
    document.getElementById('viewCreated').textContent = new Date(ad.createdAt).toLocaleString('en-US');

    const statusBadge = document.getElementById('viewStatus');
    statusBadge.textContent = ad.active ? 'Active' : 'Inactive';
    statusBadge.className = `status-badge ${ad.active ? 'active' : 'inactive'}`;

    document.getElementById('viewModal').style.display = 'block';
}

function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// Edit Ad
function editAd(id) {
    const ad = ads.find(a => a.id === id);
    if (!ad) return;

    editingAdId = id;
    document.getElementById('editTitle').value = ad.title;
    document.getElementById('editDescription').value = ad.description;
    document.getElementById('editDuration').value = ad.duration;
    document.getElementById('editActive').checked = ad.active;

    document.getElementById('editModal').style.display = 'block';
}

function saveEdit() {
    const ad = ads.find(a => a.id === editingAdId);
    if (!ad) return;

    const title = document.getElementById('editTitle').value.trim();
    if (!title) {
        alert('Please enter an ad title!');
        return;
    }

    ad.title = title;
    ad.description = document.getElementById('editDescription').value.trim();
    ad.duration = parseInt(document.getElementById('editDuration').value) || 10;
    ad.active = document.getElementById('editActive').checked;

    saveAdsToStorage();
    renderAds();
    closeEditModal();
    alert('Ad updated successfully!');
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingAdId = null;
}

// Toggle Ad Status
function toggleAdStatus(id) {
    const ad = ads.find(a => a.id === id);
    if (!ad) return;

    ad.active = !ad.active;
    saveAdsToStorage();
    renderAds();

    const status = ad.active ? 'activated' : 'deactivated';
    alert(`Ad ${status} successfully!`);
}

// Delete Ad
function deleteAd(id) {
    if (!confirm('Are you sure you want to delete this ad? This action cannot be undone.')) {
        return;
    }

    ads = ads.filter(a => a.id !== id);
    saveAdsToStorage();
    renderAds();
    alert('Ad deleted successfully!');
}

// Search and Sort
function filterAds() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortBy = document.getElementById('sortSelect').value;

    let filteredAds = ads.filter(ad => !ad.active);

    // Apply search filter
    if (searchTerm) {
        filteredAds = filteredAds.filter(ad =>
            ad.title.toLowerCase().includes(searchTerm) ||
            (ad.description && ad.description.toLowerCase().includes(searchTerm))
        );
    }

    // Apply sorting
    switch(sortBy) {
        case 'newest':
            filteredAds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredAds.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'title':
            filteredAds.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }

    // Render filtered ads
    const grid = document.getElementById('historyAdsGrid');
    if (filteredAds.length === 0) {
        grid.innerHTML = '<p class="empty-message">No matching ads found</p>';
        return;
    }

    grid.innerHTML = filteredAds.map(ad => createAdCard(ad, false)).join('');
    attachCardEventListeners();
}

// Export function for ESP32 (future use)
function getActiveAdsForESP32() {
    return ads
        .filter(ad => ad.active)
        .map(ad => ({
            id: ad.id,
            title: ad.title,
            image: ad.image,
            duration: ad.duration
        }));
}

// Make functions global for onclick handlers
window.viewAd = viewAd;
window.editAd = editAd;
window.toggleAdStatus = toggleAdStatus;
window.deleteAd = deleteAd;
window.getActiveAdsForESP32 = getActiveAdsForESP32;
