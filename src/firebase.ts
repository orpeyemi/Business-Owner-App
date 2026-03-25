import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// @ts-ignore
import firebaseAppletConfig from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey || process.env.FIREBASE_API_KEY,
  authDomain: firebaseAppletConfig.authDomain || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: firebaseAppletConfig.projectId || process.env.FIREBASE_PROJECT_ID,
  storageBucket: firebaseAppletConfig.storageBucket || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseAppletConfig.messagingSenderId || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseAppletConfig.appId || process.env.FIREBASE_APP_ID,
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || "(default)"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// CRITICAL CONSTRAINT: Test connection to Firestore
async function testConnection() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "placeholder") {
    console.warn("Firebase API Key is missing. Please set it in the Secrets panel.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();
