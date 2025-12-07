// My Biddings Page Logic
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    deleteDoc,
    doc,
    updateDoc,
    addDoc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        window.location.href = '/login.html';
    } else {
        loadUserBiddings();
    }
});

// Load user's biddings
async function loadUserBiddings() {
    if (!currentUser) return;

    const list = document.getElementById('biddingsList');
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--tmobile-light-gray);">Loading your biddings...</div>';

    try {
        const q = query(
            collection(db, 'bids'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        list.innerHTML = '';

        if (snapshot.empty) {
            list.innerHTML = `
                <div class="empty-state">
                    <h2>No biddings yet</h2>
                    <p>Click "Create New Bidding" to start your first campaign</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const card = createBiddingCard(docSnap.id, data);
            list.appendChild(card);
        });

        console.log('✅ Loaded', snapshot.size, 'biddings');

    } catch (error) {
        console.error('❌ Error loading biddings:', error);
        list.innerHTML = `
            <div style="color: #f00; text-align: center; padding: 40px;">
                Error loading biddings. Please refresh the page.
            </div>
        `;
    }
}

// Create bidding card element
function createBiddingCard(bidId, data) {
    const card = document.createElement('div');
    card.className = 'bidding-card';
    card.setAttribute('data-bid-id', bidId);

    const date = new Date(data.createdAt).toLocaleDateString();
    const statusClass = `status-${data.status || 'pending'}`;
    const statusText = (data.status || 'pending').charAt(0).toUpperCase() + (data.status || 'pending').slice(1);

    const zipcodes = data.zipcodes && data.zipcodes.length > 0
        ? data.zipcodes.join(', ')
        : data.zipcode || 'N/A';

    card.innerHTML = `
        <div class="bidding-header">
            <div>
                <div class="bidding-title">Campaign #${bidId.slice(-6)}</div>
                <div style="color: var(--tmobile-light-gray); font-size: 0.9em;">Created: ${date}</div>
            </div>
            <span class="bidding-status ${statusClass}">${statusText}</span>
        </div>

        <div class="bidding-details">
            <div class="detail-item">
                <div class="detail-label">Locations</div>
                <div class="detail-value">${zipcodes}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Duration</div>
                <div class="detail-value">${data.startDate} - ${data.endDate}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Bid Amount</div>
                <div class="detail-value">$${data.bidAmount}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Estimated Reach</div>
                <div class="detail-value">${(data.estimatedReach || 0).toLocaleString()} devices</div>
            </div>
        </div>

        <div class="bidding-ad-preview">
            <img src="${data.posterImageUrl}" alt="Ad Preview" class="ad-thumbnail">
            <div class="ad-preview-info">
                <h4>${data.posterSlogan || 'Your Ad'}</h4>
                <p>${data.timeSlots?.length || 0} time slots • ${data.advancedAudience ? 'Premium' : 'Standard'} audience</p>
            </div>
        </div>

        <div class="bidding-actions">
            ${data.status === 'active' ? `
                <button class="btn-primary" onclick="launchToESP32('${bidId}')" style="background: var(--success-green);">🚀 Launch to ESP32</button>
            ` : ''}
            <button class="btn-primary" onclick="editBidding('${bidId}')">Edit Campaign</button>
            <button class="btn-secondary" onclick="viewDetails('${bidId}')">View Details</button>
            <button class="btn-danger" onclick="deleteBidding('${bidId}')">Delete</button>
        </div>
    `;

    return card;
}

// Edit bidding
window.editBidding = function(bidId) {
    // In a real app, you would load the bidding data and pre-fill the form
    window.location.href = `/bidding.html?id=${bidId}`;
};

// View details
window.viewDetails = function(bidId) {
    alert('View details functionality coming soon!');
};

// Delete bidding
window.deleteBidding = async function(bidId) {
    if (!confirm('Are you sure you want to delete this campaign?')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'bids', bidId));
        console.log('✅ Bidding deleted:', bidId);

        // Remove card from DOM
        const card = document.querySelector(`[data-bid-id="${bidId}"]`);
        if (card) {
            card.remove();
        }

        // Check if list is empty
        const list = document.getElementById('biddingsList');
        const cards = list.querySelectorAll('.bidding-card');
        if (cards.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <h2>No biddings yet</h2>
                    <p>Click "Create New Bidding" to start your first campaign</p>
                </div>
            `;
        }

        alert('Campaign deleted successfully');

    } catch (error) {
        console.error('❌ Error deleting bidding:', error);
        alert('Error deleting campaign: ' + error.message);
    }
};

// Launch campaign to ESP32 devices
window.launchToESP32 = async function(bidId) {
    if (!confirm('🚀 Launch this campaign to ESP32 devices?\n\nThis will deploy your ad to all connected displays in the selected regions.')) {
        return;
    }

    try {
        // Get bidding details
        const bidDoc = await getDoc(doc(db, 'bids', bidId));
        if (!bidDoc.exists()) {
            alert('Campaign not found');
            return;
        }

        const bidData = bidDoc.data();

        // Create deployment record
        const deployment = {
            bidId: bidId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            campaignName: `Campaign #${bidId.slice(-6)}`,

            // Ad content
            adImageUrl: bidData.posterImageUrl,
            adSlogan: bidData.posterSlogan,

            // Deployment settings
            zipcodes: bidData.zipcodes || [bidData.zipcode],
            startDate: bidData.startDate,
            endDate: bidData.endDate,
            timeSlots: bidData.timeSlots,

            // Deployment status
            status: 'pending', // pending -> deploying -> active -> completed
            deployedAt: new Date().toISOString(),
            timestamp: Date.now(),

            // Device tracking
            targetDevices: calculateTargetDevices(bidData.zipcodes || [bidData.zipcode]),
            deployedDevices: 0,
            activeDevices: 0
        };

        // Save to deployments collection
        const deploymentDoc = await addDoc(collection(db, 'deployments'), deployment);

        console.log('✅ Deployment created:', deploymentDoc.id);

        // Update bidding status
        await updateDoc(doc(db, 'bids', bidId), {
            deploymentId: deploymentDoc.id,
            deploymentStatus: 'deployed',
            lastDeployedAt: new Date().toISOString()
        });

        alert(`✅ Campaign launched successfully!\n\nDeployment ID: ${deploymentDoc.id}\n\nYour ad will be deployed to ${deployment.targetDevices} ESP32 devices in the selected regions.`);

        // Reload the page to show updated status
        window.location.reload();

    } catch (error) {
        console.error('❌ Error launching campaign:', error);
        alert('Error launching campaign: ' + error.message);
    }
};

// Calculate target devices based on zipcodes (mock calculation)
function calculateTargetDevices(zipcodes) {
    // In production, this would query actual device database
    // For demo, calculate based on zipcode count
    const devicesPerZipcode = Math.floor(Math.random() * 50) + 20; // 20-70 devices per zipcode
    return zipcodes.length * devicesPerZipcode;
}
