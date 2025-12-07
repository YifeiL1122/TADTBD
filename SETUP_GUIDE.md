# Firebase Authentication Setup Guide

## Error: auth/configuration-not-found

This error occurs when Firebase Authentication is not properly configured in the Firebase Console.

## Quick Fix Steps

### 1. Enable Email/Password Authentication

1. Go to [Firebase Console - Authentication](https://console.firebase.google.com/project/tadtbd/authentication/providers)
2. Click on **"Sign-in method"** tab
3. Find **"Email/Password"** in the providers list
4. Click on it and toggle **"Enable"**
5. Make sure "Email/Password" is checked (not "Email link")
6. Click **"Save"**

### 2. Enable Google Authentication

1. On the same page, find **"Google"** provider
2. Click on it and toggle **"Enable"**
3. Select your email as the **"Project support email"**
4. Click **"Save"**

### 3. Verify Authorized Domains

1. Scroll down to **"Authorized domains"** section
2. Ensure these domains are listed:
   - `localhost`
   - `netassectad.web.app`
   - `netassectad.firebaseapp.com`

If missing, click **"Add domain"** to add them.

### 4. Test the Login

After configuration:
1. Visit https://netassectad.web.app/login.html
2. Try signing up with email/password
3. Try signing in with Google

## Expected Result

After enabling authentication:
- Email/Password sign up should work
- Email/Password sign in should work
- Google sign in should open a popup and work

## Common Issues

### Issue: "auth/unauthorized-domain"
**Solution:** Add the domain to Authorized domains list

### Issue: "auth/popup-blocked"
**Solution:** Allow popups for netassectad.web.app in browser settings

### Issue: Email already in use
**Solution:** Use the sign-in form instead of sign-up, or use a different email

## Security Notes

- Firestore rules ensure users can only access their own data
- Storage rules ensure users can only access their own uploaded files
- Each ad is tagged with userId for proper isolation

## Project Structure

```
public/
├── index.html              # Home page
├── login.html              # Login/Signup page
├── ad-generator.html       # Ad generator (requires auth)
├── css/
│   ├── style.css          # Global styles + navbar
│   └── ad-generator.css   # Ad generator styles
└── js/
    ├── firebase-config.js # Firebase initialization
    ├── auth.js           # Authentication logic
    └── ad-generator.js   # Ad generator with user data
```

## Testing Checklist

- [ ] Email/Password signup works
- [ ] Email/Password login works
- [ ] Google login works
- [ ] User can create and save ads
- [ ] User can view only their own saved ads
- [ ] User can download ads
- [ ] User can logout
- [ ] Navbar shows user email when logged in
- [ ] Protected pages redirect to login when not authenticated

## Contact

If you continue to have issues, check:
1. Browser console for detailed error messages
2. Firebase Console > Authentication > Users (to see if users are being created)
3. Firebase Console > Firestore > Data (to see if ads are being saved)
