// My Ads Page Logic
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    deleteDoc,
    doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        // Redirect to login if not authenticated
        window.location.href = '/login.html';
    } else {
        loadUserAds();
    }
});

// Load user's ads
async function loadUserAds() {
    if (!currentUser) return;

    const gallery = document.getElementById('adsGallery');
    const createNewCard = gallery.querySelector('.create-new');

    // Show loading
    gallery.innerHTML = '';
    gallery.appendChild(createNewCard);
    const loadingDiv = document.createElement('div');
    loadingDiv.style.gridColumn = '1 / -1';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '40px';
    loadingDiv.style.color = 'var(--tmobile-light-gray)';
    loadingDiv.textContent = 'Loading your ads...';
    gallery.appendChild(loadingDiv);

    try {
        const q = query(
            collection(db, 'ads'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        // Remove loading
        loadingDiv.remove();

        if (snapshot.empty) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.style.gridColumn = '1 / -1';
            emptyDiv.innerHTML = `
                <h2>No ads yet</h2>
                <p>Click "Create New Ad" to get started</p>
            `;
            gallery.appendChild(emptyDiv);
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const adCard = createAdCard(docSnap.id, data);
            gallery.appendChild(adCard);
        });

        console.log('✅ Loaded', snapshot.size, 'ads');

    } catch (error) {
        console.error('❌ Error loading ads:', error);
        loadingDiv.innerHTML = `
            <div style="color: #f00;">Error loading ads. Please refresh the page.</div>
        `;
    }
}

// Create ad card element
function createAdCard(adId, data) {
    const card = document.createElement('div');
    card.className = 'ad-card';
    card.setAttribute('data-ad-id', adId);

    const date = new Date(data.createdAt || data.timestamp).toLocaleDateString();
    const adName = data.name || 'Untitled Ad';
    const slogan = data.slogan || 'No slogan';

    card.innerHTML = `
        <img src="${data.imageUrl}" alt="${slogan}" class="ad-preview" onclick="editAd('${adId}')">
        <div class="ad-info">
            <div class="ad-name">${adName}</div>
            <div class="ad-slogan">${slogan}</div>
            <div class="ad-meta">
                <div class="ad-date">${date}</div>
                <div class="ad-actions">
                    <button class="btn-icon" onclick="editAd('${adId}')" title="Edit">✏️</button>
                    <button class="btn-icon" onclick="deleteAd('${adId}')" title="Delete">🗑️</button>
                </div>
            </div>
        </div>
    `;

    return card;
}

// Edit ad (go to ad generator with this ad loaded)
window.editAd = function(adId) {
    window.location.href = `/ad-generator.html?id=${adId}`;
};

// Delete ad
window.deleteAd = async function(adId) {
    if (!confirm('Are you sure you want to delete this ad?')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'ads', adId));
        console.log('✅ Ad deleted:', adId);

        // Remove card from DOM
        const card = document.querySelector(`[data-ad-id="${adId}"]`);
        if (card) {
            card.remove();
        }

        // Check if gallery is empty
        const gallery = document.getElementById('adsGallery');
        const adCards = gallery.querySelectorAll('.ad-card:not(.create-new)');
        if (adCards.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.style.gridColumn = '1 / -1';
            emptyDiv.innerHTML = `
                <h2>No ads yet</h2>
                <p>Click "Create New Ad" to get started</p>
            `;
            gallery.appendChild(emptyDiv);
        }

        alert('Ad deleted successfully');

    } catch (error) {
        console.error('❌ Error deleting ad:', error);
        alert('Error deleting ad: ' + error.message);
    }
};
