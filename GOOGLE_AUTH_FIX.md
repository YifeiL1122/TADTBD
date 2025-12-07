# Fix: Google Login - auth/unauthorized-domain

## Problem
Email/Password login works ✅, but Google login shows `auth/unauthorized-domain` error.

## Root Cause
Google OAuth requires additional configuration in Google Cloud Console for redirect URIs.

## Solution

### Step 1: Configure OAuth Client in Google Cloud Console

1. **Open Google Cloud Console Credentials**
   - URL: https://console.cloud.google.com/apis/credentials?project=tadtbd
   - Or: Google Cloud Console → APIs & Services → Credentials

2. **Find the OAuth 2.0 Client**
   - Look for a client named something like:
     - "Web client (auto created by Google Service)"
     - "Firebase Web Client"
   - Click on it to edit

3. **Add Authorized JavaScript Origins**

   Click "Add URI" and add these URLs:
   ```
   https://netassectad.web.app
   https://netassectad.firebaseapp.com
   https://tadtbd.firebaseapp.com
   ```

4. **Add Authorized Redirect URIs**

   Click "Add URI" under "Authorized redirect URIs" and add:
   ```
   https://tadtbd.firebaseapp.com/__/auth/handler
   https://netassectad.web.app/__/auth/handler
   https://netassectad.firebaseapp.com/__/auth/handler
   ```

5. **Save Changes**
   - Click the "SAVE" button at the bottom of the page
   - Wait a few seconds for changes to propagate

### Step 2: Configure OAuth Consent Screen (if needed)

1. **Open OAuth Consent Screen**
   - URL: https://console.cloud.google.com/apis/credentials/consent?project=tadtbd

2. **Configure Basic Info**
   - User Type: External (unless you have a Google Workspace)
   - App name: T-Mobile Ad System
   - User support email: your email
   - Developer contact: your email
   - Click "Save and Continue"

3. **Scopes** (optional for now)
   - Click "Save and Continue"

4. **Test Users** (if app is not published)
   - Add your email address as a test user
   - Click "Save and Continue"

5. **Publish App** (optional)
   - You can leave it in "Testing" mode
   - Only test users can sign in
   - Or publish it for everyone

### Step 3: Verify Firebase Settings

1. **Open Firebase Authentication**
   - URL: https://console.firebase.google.com/project/tadtbd/authentication/providers

2. **Check Google Provider**
   - Make sure Google is "Enabled"
   - Web SDK configuration should show your Web client ID
   - Web client secret should be filled (auto-managed by Firebase)

### Step 4: Test Google Login

1. **Wait 1-2 minutes** for changes to propagate
2. Go to: https://netassectad.web.app/test-auth.html
3. **Hard refresh** (Cmd+Shift+R or Ctrl+Shift+R)
4. Click **"Test Google Login"** button
5. Should see popup asking you to choose Google account
6. Should see ✅ success message!

## Troubleshooting

### Error: "redirect_uri_mismatch"
- Check that all redirect URIs are added correctly
- Make sure there are no typos
- The URIs must end with `/__/auth/handler`

### Error: "invalid_client"
- Check that JavaScript origins are added
- Make sure you saved changes in Google Cloud Console

### Error: "access_denied" or "consent required"
- Add your email as a test user in OAuth consent screen
- Or publish the app for everyone

### Popup Blocked
- Allow popups for netassectad.web.app in browser settings
- Try again

## Quick Checklist

- [ ] OAuth Client has Authorized JavaScript Origins
  - [ ] https://netassectad.web.app
  - [ ] https://netassectad.firebaseapp.com
  - [ ] https://tadtbd.firebaseapp.com

- [ ] OAuth Client has Authorized Redirect URIs
  - [ ] https://tadtbd.firebaseapp.com/__/auth/handler
  - [ ] https://netassectad.web.app/__/auth/handler
  - [ ] https://netassectad.firebaseapp.com/__/auth/handler

- [ ] OAuth Consent Screen is configured
  - [ ] App name set
  - [ ] Support email set
  - [ ] Test user added (if not published)

- [ ] Firebase Google provider is Enabled

- [ ] Waited 1-2 minutes after saving changes

- [ ] Tested in incognito/private window

## Expected Result

After configuration:
```
[23:41:43] 🔐 Testing Google login...
[23:41:44] ✅ Google login successful!
[23:41:44] ✅ Email: your@email.com
[23:41:44] ✅ User ID: abc123xyz...
```

---

**Error**: `auth/unauthorized-domain` on Google login
**Cause**: Missing OAuth redirect URI configuration
**Fix**: Add redirect URIs in Google Cloud Console
