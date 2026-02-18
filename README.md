# TADTBD Dashboard

This branch contains only the Admin Dashboard component from the TADTBD project.

## Dashboard Components

### Admin Dashboard
- **Main Dashboard**: `public/admin.html` - Admin control panel with multiple tabs
- **Login Page**: `public/admin-login.html` - Admin authentication
- **Enhanced Styling**: `public/css/admin-enhanced.css` - Modern UI/UX design

### JavaScript Modules
- **Dashboard Logic**: `public/js/admin.js` - Main dashboard functionality
- **Ranking System**: `public/js/ranking-admin.js` - GSP auction admin interface
- **Ranking Core**: `public/js/ranking-core.js` - GSP auction algorithm
- **Demo Dataset**: `public/js/demo-dataset.js` - CSV data loader for demo mode
- **Tuesday Campaigns**: `public/js/tuesday-coupons-admin.js` - T-Mobile Tuesday manager
- **Authentication**: `public/js/auth.js` - Firebase authentication

### Configuration & Data
- **Firebase Config**: `public/firebase-config.js` - Firebase initialization
- **Firestore Rules**: `firestore.rules` - Database security rules
- **Firebase Hosting**: `firebase.json`, `.firebaserc` - Deployment config
- **Demo Data**: `public/data/ads_input_1000_local_usd_week_8slots_varslots_clean.csv` - Sample dataset

## Features

### Dashboard Tabs
1. **All Campaigns** - View all user campaigns with filtering
2. **Deployments** - Manage ad deployments to devices
3. **Schedule** - Timeline view of active campaigns
4. **Ranking** - GSP auction simulation and results
5. **Analytics** - Charts and visualization (revenue, status, zip codes)

### Special Features
- **Demo Mode**: Toggle to use CSV sample data instead of live Firebase data
- **T-Mobile Tuesday Manager**: Highlight Tuesday winning ads
- **Coupon Statistics**: Track coupon send/use status
- **Export Results**: Save ranking runs to Firestore

## Setup

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Deploy:
```bash
firebase deploy --only hosting
```

## Live Demo
Visit: https://netassectad.web.app/admin.html

## Tech Stack
- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3
- **Backend**: Firebase (Auth, Firestore, Hosting)
- **Charts**: Chart.js
- **Auction Algorithm**: GSP (Generalized Second-Price)

---
**Note**: This is a standalone dashboard branch. For the full TADTBD project, see the `main` branch.
