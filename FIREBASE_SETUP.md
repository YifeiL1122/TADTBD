# Firebase Setup Guide for T-Mobile Ad Generator

This guide will help you set up Firebase for the Ad Generator application.

## Prerequisites

- A Google account
- Basic understanding of Firebase

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter a project name (e.g., "tmobile-ad-generator")
4. Disable Google Analytics (optional for this project)
5. Click **"Create project"**

## Step 2: Register Your Web App

1. In your Firebase project dashboard, click the **Web icon** (`</>`)
2. Register your app with a nickname (e.g., "Ad Generator Web")
3. **DO NOT** check "Set up Firebase Hosting" for now
4. Click **"Register app"**
5. **Copy the Firebase configuration object** - you'll need this later

Your config will look like this:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

## Step 3: Enable Firestore Database

1. In the Firebase Console, go to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** (for development)
4. Choose a location closest to you
5. Click **"Enable"**

### Set Up Firestore Security Rules

For development, use these rules (⚠️ **Not recommended for production**):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

For production, use more secure rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ads/{adId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Step 4: Enable Firebase Storage

1. In the Firebase Console, go to **Build** → **Storage**
2. Click **"Get started"**
3. Select **"Start in test mode"**
4. Click **"Next"**
5. Choose the same location as Firestore
6. Click **"Done"**

### Set Up Storage Security Rules

For development:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /ads/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

For production:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /ads/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Step 5: Update Your Application

1. Open `ad-generator.js` in your code editor
2. Find the Firebase configuration section (around line 8-16)
3. Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",              // Replace with your actual API key
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

## Step 6: Test Your Application

1. Open `ad-generator.html` in a modern web browser
2. Open the browser console (F12 or Cmd+Option+I)
3. You should see: `"Firebase initialized successfully"`
4. If you see an error, double-check your configuration

## Step 7: Verify Firebase Integration

### Test Creating an Ad:

1. Upload a logo
2. Enter a slogan
3. Enter a description
4. Click **"Save to Cloud"**
5. Check the browser console for success message

### Verify in Firebase Console:

1. Go to **Firestore Database** in Firebase Console
2. You should see an `ads` collection with your saved ad
3. Go to **Storage** in Firebase Console
4. You should see your ad image in the `ads/` folder

## Firestore Data Structure

Your ads will be stored with this structure:

```javascript
{
    slogan: "Your slogan text",
    description: "Your description text",
    template: "modern" or "professional",
    logoData: "data:image/png;base64,...",
    imageUrl: "https://firebasestorage.googleapis.com/...",
    createdAt: "2025-01-18T10:30:00.000Z",
    timestamp: 1705574400000
}
```

## Troubleshooting

### Error: "Firebase not configured"
- Make sure you've replaced ALL placeholder values in `firebaseConfig`
- Check that your API key is correct

### Error: "Permission denied"
- Check your Firestore and Storage security rules
- Make sure you're in "test mode" for development

### Error: "CORS issue"
- This usually happens with Storage
- Make sure your storage bucket is publicly readable
- Check the CORS configuration

### Error: "Quota exceeded"
- Free tier has limits on storage and bandwidth
- Check your Firebase Console quotas

## Firebase Free Tier Limits

- **Firestore**: 1 GB storage, 50K reads/day, 20K writes/day
- **Storage**: 5 GB storage, 1 GB download/day
- **Hosting** (optional): 10 GB storage, 360 MB/day bandwidth

These limits are sufficient for development and small projects.

## Optional: Set Up Firebase Hosting

If you want to deploy your app:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Deploy: `firebase deploy --only hosting`

## Security Recommendations for Production

1. **Enable Authentication**: Add Firebase Auth to restrict who can create ads
2. **Update Security Rules**: Use authenticated-only write access
3. **Add Rate Limiting**: Prevent abuse
4. **Enable reCAPTCHA**: For public forms
5. **Monitor Usage**: Set up billing alerts

## Need Help?

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Storage Documentation](https://firebase.google.com/docs/storage)

---

## Quick Reference: Firebase Console URLs

- **Console**: https://console.firebase.google.com/
- **Firestore**: `https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore`
- **Storage**: `https://console.firebase.google.com/project/YOUR_PROJECT_ID/storage`
- **Settings**: `https://console.firebase.google.com/project/YOUR_PROJECT_ID/settings/general`

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.
