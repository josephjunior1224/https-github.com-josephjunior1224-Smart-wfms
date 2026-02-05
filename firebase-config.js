/**
 * Firebase Configuration
 * Initializes Firebase Admin SDK for backend operations
 */

const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
  path.join(__dirname, 'firebase-service-account.json');

if (!process.env.FIREBASE_PROJECT_ID) {
  console.warn('⚠️  Firebase environment variables not configured');
  console.warn('Please set FIREBASE_PROJECT_ID and other Firebase variables in .env');
}

try {
  // Initialize with service account file
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccount = require(serviceAccountPath);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
      projectId: process.env.FIREBASE_PROJECT_ID || undefined
    });
    
    console.log('✓ Firebase Admin SDK initialized with service account');
  } else {
    // Try to use environment variables (for deployment)
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    console.log('✓ Firebase Admin SDK initialized with environment credentials');
  }
} catch (err) {
  console.error('✗ Firebase initialization warning:', err.message);
  console.error('Firebase will be disabled until properly configured');
}

// Export Firestore, Realtime Database, and Auth references
module.exports = {
  db: admin.firestore(),
  realtimeDB: admin.database(),
  auth: admin.auth(),
  admin: admin,
  isInitialized: admin.apps.length > 0
};
