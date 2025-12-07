// Bidding System Logic
console.log('🚀 Bidding.js module loading...');

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Import auth.js for shared auth functionality
import './auth.js';

console.log('✅ Bidding.js imports successful');

// Global state
let currentUser = null;
let currentStep = 1;
let biddingData = {
    zipcode: '',
    zipcodes: [],
    startDate: '',
    endDate: '',
    timeSlots: [],
    advancedAudience: false,
    selectedPoster: null,
    bidAmount: 0,
    bidType: ''
};
let userAds = [];

// Map state
let map = null;
let selectedMarkers = [];
let selectedCircles = [];

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        alert('Please sign in to access bidding');
        window.location.href = '/login.html';
    } else {
        loadUserAds();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Bidding page DOM loaded');
    generateTimeSlots();
    setMinDates();
    initializeMockupMap();
});

// Major US Cities with ZIP codes
const majorCities = [
    { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321, zip: '98101', population: '750K' },
    { name: 'New York, NY', lat: 40.7128, lng: -74.0060, zip: '10001', population: '8.3M' },
    { name: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437, zip: '90001', population: '4M' },
    { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298, zip: '60601', population: '2.7M' },
    { name: 'Houston, TX', lat: 29.7604, lng: -95.3698, zip: '77001', population: '2.3M' },
    { name: 'Phoenix, AZ', lat: 33.4484, lng: -112.0740, zip: '85001', population: '1.7M' },
    { name: 'Philadelphia, PA', lat: 39.9526, lng: -75.1652, zip: '19019', population: '1.6M' },
    { name: 'San Antonio, TX', lat: 29.4241, lng: -98.4936, zip: '78201', population: '1.5M' },
    { name: 'San Diego, CA', lat: 32.7157, lng: -117.1611, zip: '92101', population: '1.4M' },
    { name: 'Dallas, TX', lat: 32.7767, lng: -96.7970, zip: '75201', population: '1.3M' },
    { name: 'San Jose, CA', lat: 37.3382, lng: -121.8863, zip: '95101', population: '1M' },
    { name: 'Austin, TX', lat: 30.2672, lng: -97.7431, zip: '78701', population: '978K' },
    { name: 'Jacksonville, FL', lat: 30.3322, lng: -81.6557, zip: '32099', population: '950K' },
    { name: 'San Francisco, CA', lat: 37.7749, lng: -122.4194, zip: '94102', population: '875K' },
    { name: 'Columbus, OH', lat: 39.9612, lng: -82.9988, zip: '43004', population: '900K' },
    { name: 'Fort Worth, TX', lat: 32.7555, lng: -97.3308, zip: '76101', population: '918K' },
    { name: 'Charlotte, NC', lat: 35.2271, lng: -80.8431, zip: '28202', population: '885K' },
    { name: 'Denver, CO', lat: 39.7392, lng: -104.9903, zip: '80201', population: '715K' },
    { name: 'Boston, MA', lat: 42.3601, lng: -71.0589, zip: '02101', population: '692K' },
    { name: 'Portland, OR', lat: 45.5152, lng: -122.6784, zip: '97201', population: '650K' }
];

// Initialize Mockup Map
function initializeMockupMap() {
    console.log('🗺️ Initializing mockup map...');

    const mapMockup = document.getElementById('mapMockup');
    if (!mapMockup) return;

    // Create city markers
    const html = majorCities.map(city => `
        <div class="city-marker" data-zip="${city.zip}" onclick="toggleCitySelection('${city.zip}', '${city.name}')">
            <div class="city-name">${city.name}</div>
            <div class="city-zip">ZIP: ${city.zip}</div>
            <div class="city-population">${city.population}</div>
        </div>
    `).join('');

    mapMockup.innerHTML = html;
    console.log('✅ Mockup map initialized with', majorCities.length, 'cities');
}

// Toggle city selection on mockup map
window.toggleCitySelection = function(zip, cityName) {
    console.log('📍 Toggle ZIP:', zip, cityName);

    const cityMarker = document.querySelector(`.city-marker[data-zip="${zip}"]`);
    if (!cityMarker) return;

    // Check if already selected
    const index = biddingData.zipcodes.indexOf(zip);
    if (index > -1) {
        // Deselect
        biddingData.zipcodes.splice(index, 1);
        cityMarker.classList.remove('selected');
    } else {
        // Select
        biddingData.zipcodes.push(zip);
        cityMarker.classList.add('selected');
    }

    updateSelectedZipcodesDisplay();
};

// Update selected zipcodes display
function updateSelectedZipcodesDisplay() {
    const container = document.getElementById('selectedZipcodes');
    const infoBox = document.getElementById('zipcodeInfo');

    if (biddingData.zipcodes.length === 0) {
        infoBox.classList.remove('active');
        return;
    }

    infoBox.classList.add('active');

    const html = biddingData.zipcodes.map(zip => {
        const city = majorCities.find(c => c.zip === zip);
        return `
            <div class="zipcode-tag">
                <span>${zip} - ${city ? city.name : 'Unknown'}</span>
                <span class="remove" onclick="removeZipcode('${zip}')">×</span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Remove zipcode
window.removeZipcode = function(zip) {
    const city = majorCities.find(c => c.zip === zip);
    if (city) {
        toggleCitySelection(zip, city.name);
    }
};

// Handle manual zipcode input
window.handleManualZipcode = function() {
    const input = document.getElementById('zipcode');
    const zip = input.value.trim();

    if (zip.length === 5) {
        // Check if it matches a known city
        const city = majorCities.find(c => c.zip === zip);
        if (city) {
            if (!biddingData.zipcodes.includes(zip)) {
                toggleCitySelection(zip, city.name);
            }
        } else {
            // Add custom zipcode
            if (!biddingData.zipcodes.includes(zip)) {
                biddingData.zipcodes.push(zip);
                updateSelectedZipcodesDisplay();
            }
        }
    }
};

// Generate time slots (2-hour blocks)
function generateTimeSlots() {
    const timeSlotsContainer = document.getElementById('timeSlots');
    const slots = [
        '00:00-02:00', '02:00-04:00', '04:00-06:00', '06:00-08:00',
        '08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00',
        '16:00-18:00', '18:00-20:00', '20:00-22:00', '22:00-24:00'
    ];

    timeSlotsContainer.innerHTML = slots.map(slot =>
        `<div class="time-slot" onclick="toggleTimeSlot('${slot}')">${slot}</div>`
    ).join('');
}

// Toggle time slot selection
window.toggleTimeSlot = function(slot) {
    const element = event.target;
    element.classList.toggle('selected');

    const index = biddingData.timeSlots.indexOf(slot);
    if (index > -1) {
        biddingData.timeSlots.splice(index, 1);
    } else {
        biddingData.timeSlots.push(slot);
    }

    console.log('Selected time slots:', biddingData.timeSlots);
};

// Set minimum dates
function setMinDates() {
    const today = new Date().toISOString().split('T')[0];
    const minEndDate = new Date();
    minEndDate.setDate(minEndDate.getDate() + 7);
    const minEnd = minEndDate.toISOString().split('T')[0];

    document.getElementById('startDate').min = today;
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').min = minEnd;
    document.getElementById('endDate').value = minEnd;

    // Update end date when start date changes
    document.getElementById('startDate').addEventListener('change', function() {
        const startDate = new Date(this.value);
        const minEndDate = new Date(startDate);
        minEndDate.setDate(minEndDate.getDate() + 7);
        document.getElementById('endDate').min = minEndDate.toISOString().split('T')[0];
    });
}

// Navigation functions
window.goToStep = function(step) {
    // Hide all cards
    document.querySelectorAll('.bidding-card').forEach(card => {
        card.classList.remove('active');
    });

    // Update progress circles
    for (let i = 1; i <= 4; i++) {
        const circle = document.getElementById(`circle-${i}`);
        circle.classList.remove('active', 'completed');
        if (i < step) {
            circle.classList.add('completed');
        } else if (i === step) {
            circle.classList.add('active');
        }
    }

    // Show selected card
    document.getElementById(`step-${step}`).classList.add('active');
    currentStep = step;

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Step 1 -> Step 2
window.goToStep2 = function() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // Validation
    if (biddingData.zipcodes.length === 0) {
        alert('Please select at least one ZIP code region from the map or enter manually');
        return;
    }

    if (!startDate || !endDate) {
        alert('Please select start and end dates');
        return;
    }

    if (biddingData.timeSlots.length === 0) {
        alert('Please select at least one time slot');
        return;
    }

    // Calculate days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (daysDiff < 7) {
        alert('Campaign must be at least 7 days long');
        return;
    }

    // Save data (keep first zipcode for backward compatibility)
    biddingData.zipcode = biddingData.zipcodes[0];
    biddingData.startDate = startDate;
    biddingData.endDate = endDate;

    // Calculate reach (fake numbers based on selections)
    calculateReach();

    // Go to step 2
    goToStep(2);
};

// Calculate reach (demo with fake numbers)
function calculateReach() {
    const baseDevices = Math.floor(Math.random() * 5000) + 10000; // 10k-15k per zipcode
    const timeSlotsMultiplier = biddingData.timeSlots.length * 0.1;
    const zipcodesMultiplier = biddingData.zipcodes.length; // More zipcodes = more reach
    const devices = Math.floor(baseDevices * (1 + timeSlotsMultiplier) * zipcodesMultiplier);
    const impressionsPerDay = Math.floor(devices * 1.5);

    document.getElementById('deviceReach').textContent = devices.toLocaleString();
    document.getElementById('impressionsReach').textContent = impressionsPerDay.toLocaleString();

    // Calculate advanced reach
    const advancedDevices = Math.floor(devices * 0.3);
    document.getElementById('advancedReach').textContent = '+' + advancedDevices.toLocaleString();

    // Store for later use
    biddingData.baseReach = devices;
    biddingData.advancedReachBonus = advancedDevices;
}

// Toggle advanced audience
window.toggleAdvanced = function() {
    const checkbox = document.getElementById('advancedCheckbox');
    const option = document.getElementById('advancedOption');

    checkbox.checked = !checkbox.checked;
    biddingData.advancedAudience = checkbox.checked;

    if (checkbox.checked) {
        option.classList.add('selected');
    } else {
        option.classList.remove('selected');
    }

    console.log('Advanced audience:', biddingData.advancedAudience);
};

// Step 2 -> Step 3
window.goToStep3 = function() {
    goToStep(3);
};

// Load user's saved ads
async function loadUserAds() {
    if (!currentUser) return;

    const posterGrid = document.getElementById('posterGrid');
    posterGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--tmobile-light-gray);">Loading your ads...</div>';

    try {
        const q = query(
            collection(db, 'ads'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            posterGrid.innerHTML = `
                <div style="padding: 40px; text-align: center; grid-column: 1/-1;">
                    <p style="color: var(--tmobile-light-gray); margin-bottom: 20px;">No saved ads yet</p>
                    <a href="/ad-generator.html" class="btn-primary">Create Your First Ad</a>
                </div>
            `;
            return;
        }

        userAds = [];
        let html = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            userAds.push({ id: doc.id, ...data });

            const date = new Date(data.createdAt).toLocaleDateString();
            html += `
                <div class="poster-item" onclick="selectPoster('${doc.id}')">
                    <img src="${data.imageUrl}" alt="${data.slogan}">
                    <div class="poster-info">
                        <div class="poster-title">${data.slogan || 'Untitled'}</div>
                        <div class="poster-date">${date}</div>
                    </div>
                </div>
            `;
        });

        posterGrid.innerHTML = html;
        console.log('✅ Loaded', userAds.length, 'ads');

    } catch (error) {
        console.error('❌ Error loading ads:', error);
        posterGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: #f00;">Error loading ads. Please refresh the page.</div>';
    }
}

// Select poster
window.selectPoster = function(posterId) {
    // Remove previous selection
    document.querySelectorAll('.poster-item').forEach(item => {
        item.classList.remove('selected');
        const badge = item.querySelector('.selected-badge');
        if (badge) badge.remove();
    });

    // Add selection
    event.currentTarget.classList.add('selected');
    const badge = document.createElement('div');
    badge.className = 'selected-badge';
    badge.textContent = '✓ Selected';
    event.currentTarget.appendChild(badge);

    // Save selection
    biddingData.selectedPoster = userAds.find(ad => ad.id === posterId);
    console.log('Selected poster:', biddingData.selectedPoster);
};

// Step 3 -> Step 4
window.goToStep4 = function() {
    if (!biddingData.selectedPoster) {
        alert('Please select an ad to continue');
        return;
    }

    // Generate campaign summary
    updateCampaignSummary();
    goToStep(4);
};

// Update campaign summary
function updateCampaignSummary() {
    const days = Math.ceil((new Date(biddingData.endDate) - new Date(biddingData.startDate)) / (1000 * 60 * 60 * 24));
    const totalReach = biddingData.advancedAudience
        ? biddingData.baseReach + biddingData.advancedReachBonus
        : biddingData.baseReach;

    const summary = `
        <div style="display: grid; gap: 10px;">
            <div><strong>Locations:</strong> ${biddingData.zipcodes.length} ZIP code(s) - ${biddingData.zipcodes.join(', ')}</div>
            <div><strong>Duration:</strong> ${days} days (${biddingData.startDate} to ${biddingData.endDate})</div>
            <div><strong>Time Slots:</strong> ${biddingData.timeSlots.length} selected</div>
            <div><strong>Estimated Reach:</strong> ${totalReach.toLocaleString()} devices</div>
            <div><strong>Audience Type:</strong> ${biddingData.advancedAudience ? 'Premium' : 'Standard'}</div>
            <div><strong>Ad:</strong> ${biddingData.selectedPoster.slogan}</div>
        </div>
    `;

    document.getElementById('campaignSummary').innerHTML = summary;
}

// Select price
window.selectPrice = function(amount, type) {
    // Remove previous selection
    document.querySelectorAll('.price-card').forEach(card => {
        card.classList.remove('selected');
    });

    // Clear custom input
    document.getElementById('customBid').value = '';

    // Add selection
    event.currentTarget.classList.add('selected');

    // Save data
    biddingData.bidAmount = amount;
    biddingData.bidType = type;

    console.log('Selected bid:', amount, type);
};

// Handle custom bid input
document.addEventListener('DOMContentLoaded', function() {
    const customBidInput = document.getElementById('customBid');
    if (customBidInput) {
        customBidInput.addEventListener('input', function() {
            // Remove selection from preset prices
            document.querySelectorAll('.price-card').forEach(card => {
                card.classList.remove('selected');
            });

            if (this.value) {
                biddingData.bidAmount = parseInt(this.value);
                biddingData.bidType = 'custom';
                console.log('Custom bid:', biddingData.bidAmount);
            }
        });
    }
});

// Submit bid
window.submitBid = async function() {
    if (!biddingData.bidAmount || biddingData.bidAmount < 10) {
        alert('Please select or enter a bid amount (minimum $10)');
        return;
    }

    if (!currentUser) {
        alert('Please sign in to submit a bid');
        return;
    }

    const confirmMsg = `
Are you sure you want to submit this bid?

Amount: $${biddingData.bidAmount}
Duration: ${Math.ceil((new Date(biddingData.endDate) - new Date(biddingData.startDate)) / (1000 * 60 * 60 * 24))} days
Estimated Reach: ${(biddingData.advancedAudience ? biddingData.baseReach + biddingData.advancedReachBonus : biddingData.baseReach).toLocaleString()} devices
    `.trim();

    if (!confirm(confirmMsg)) return;

    try {
        // Save bid to Firestore
        const bidDoc = {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            zipcode: biddingData.zipcode,
            zipcodes: biddingData.zipcodes || [biddingData.zipcode],
            startDate: biddingData.startDate,
            endDate: biddingData.endDate,
            timeSlots: biddingData.timeSlots,
            advancedAudience: biddingData.advancedAudience,
            estimatedReach: biddingData.advancedAudience
                ? biddingData.baseReach + biddingData.advancedReachBonus
                : biddingData.baseReach,
            posterId: biddingData.selectedPoster.id,
            posterSlogan: biddingData.selectedPoster.slogan,
            posterImageUrl: biddingData.selectedPoster.imageUrl,
            bidAmount: biddingData.bidAmount,
            bidType: biddingData.bidType,
            status: 'pending',
            createdAt: new Date().toISOString(),
            timestamp: Date.now()
        };

        await addDoc(collection(db, 'bids'), bidDoc);

        alert('✅ Bid submitted successfully!\n\nYou will be notified when your bid is processed.');

        // Redirect to my biddings page
        window.location.href = '/my-biddings.html';

    } catch (error) {
        console.error('❌ Error submitting bid:', error);
        alert('Error submitting bid: ' + error.message);
    }
};

// Debug: Log that all functions are registered
console.log('✅ All window functions registered:', {
    removeZipcode: typeof window.removeZipcode,
    handleManualZipcode: typeof window.handleManualZipcode,
    toggleTimeSlot: typeof window.toggleTimeSlot,
    goToStep: typeof window.goToStep,
    goToStep2: typeof window.goToStep2,
    goToStep3: typeof window.goToStep3,
    goToStep4: typeof window.goToStep4,
    toggleAdvanced: typeof window.toggleAdvanced,
    selectPoster: typeof window.selectPoster,
    selectPrice: typeof window.selectPrice,
    submitBid: typeof window.submitBid
});
