// Bridge module so existing /public/js/* imports keep working.
// Source of truth stays at /public/firebase-config.js.
export { app, auth, db, storage } from '../firebase-config.js';
