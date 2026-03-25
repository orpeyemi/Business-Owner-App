import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// In AI Studio, these are often injected into the environment.
// If firebase-applet-config.json doesn't exist, we fallback to env variables.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "placeholder",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "placeholder",
  projectId: process.env.FIREBASE_PROJECT_ID || "placeholder",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "placeholder",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "placeholder",
  appId: process.env.FIREBASE_APP_ID || "placeholder"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// CRITICAL CONSTRAINT: Test connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();
