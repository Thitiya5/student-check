import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, getDocs, collection, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD7eAlvOAVbWYnShIxdEMYBmRQJxZRbZXs',
  authDomain: 'famous-augury-495905-c3.firebaseapp.com',
  projectId: 'famous-augury-495905-c3',
  storageBucket: 'famous-augury-495905-c3.firebasestorage.app',
  messagingSenderId: '1022767947078',
  appId: '1:1022767947078:web:167597c734483edc95d947',
  measurementId: 'G-RTCJTX9TYN'
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

let analytics = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(firebaseApp);
  } catch (error) {
    console.warn('Firebase Analytics initialization failed:', error);
  }
}

/**
 * Lightweight Firestore connectivity check (read).
 */
export async function verifyFirestoreConnection() {
  const q = query(collection(db, 'attendance'), limit(1));
  await getDocs(q);
  console.log('[firebase] Firestore connection OK');
  return true;
}

export { firebaseApp, analytics, db };
