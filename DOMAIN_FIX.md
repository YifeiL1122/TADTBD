# Fix: auth/unauthorized-domain Error

## Problem
Firebase Authentication is blocking login attempts because the domain `netassectad.web.app` is not in the authorized domains list.

## Solution

### Step 1: Go to Firebase Console Settings
1. Open: https://console.firebase.google.com/project/tadtbd/authentication/settings
2. Scroll down to the **"Authorized domains"** section

### Step 2: Add Required Domains

Click **"Add domain"** and add these domains one by one:

1. ✅ `netassectad.web.app` (your hosting domain)
2. ✅ `netassectad.firebaseapp.com` (Firebase default domain)
3. ✅ `localhost` (for local testing - usually already there)

### Step 3: Verify

After adding domains, the list should look like:

```
Authorized domains
├── localhost
├── netassectad.web.app
├── netassectad.firebaseapp.com
└── (possibly) tadtbd.firebaseapp.com
```

### Step 4: Test Again

1. Go to https://netassectad.web.app/test-auth.html
2. Click "Test Signup" or "Test Google Login"
3. You should see ✅ success messages instead of ❌ errors

## Why This Happens

Firebase restricts which domains can use your authentication to prevent:
- Unauthorized websites from using your Firebase project
- Security vulnerabilities
- Phishing attacks

By adding domains to the authorized list, you're telling Firebase "it's OK for users to authenticate from these domains."

## Expected Result

After adding the domains:
- ✅ Email/Password signup works
- ✅ Email/Password login works
- ✅ Google login popup works
- ✅ No more "unauthorized-domain" errors

## Still Having Issues?

If you still see errors after adding domains:
1. Wait 1-2 minutes for Firebase to propagate changes
2. Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+R)
3. Try in an incognito/private window
4. Check browser console for any other errors

## Visual Guide

```
Firebase Console
└── Authentication
    └── Settings (tab)
        └── Authorized domains (scroll down)
            └── Add domain (blue button)
                └── Type: netassectad.web.app
                    └── Click "Add"
```

---

**Current Error**: `Firebase: Error (auth/unauthorized-domain)`
**Current Domain**: `netassectad.web.app`
**Action Required**: Add domain to authorized list in Firebase Console
