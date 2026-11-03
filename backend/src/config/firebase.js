'use strict';

const admin = require('firebase-admin');

let initialized = false;

function initializeFirebase() {
  if (initialized) {
    return admin;
  }

  if (admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  /*
   * Notifications should not prevent the whole
   * API from booting in development if Firebase
   * credentials are intentionally absent.
   */
  if (
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_CLIENT_EMAIL ||
    !FIREBASE_PRIVATE_KEY
  ) {
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,

      clientEmail: FIREBASE_CLIENT_EMAIL,

      privateKey: FIREBASE_PRIVATE_KEY.replace(
        /\\n/g,
        '\n',
      ),
    }),
  });

  initialized = true;

  return admin;
}

function getFirebaseAdmin() {
  return initializeFirebase();
}

module.exports = {
  getFirebaseAdmin,
};