/**
 * Firebase Authentication — custom tokens via Cloud Function `issueTeacherToken`.
 * Required for Firestore security rules (role / assigned classes).
 */
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebaseClient.js';

const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-southeast1';

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ pin?: string, refresh?: boolean }} [opts]
 */
export async function signInFirebaseForTeacherSession(session, opts = {}) {
  if (!session?.teacherName) {
    throw new Error('ไม่พบข้อมูลครู — กรุณาเข้าสู่ระบบใหม่');
  }

  const auth = getAuth(firebaseApp);
  const teacherName = String(session.teacherName);

  if (auth.currentUser) {
    try {
      const result = await auth.currentUser.getIdTokenResult();
      if (result.claims?.teacherName === teacherName) {
        return auth.currentUser;
      }
    } catch {
      // refresh sign-in below
    }
    await signOut(auth);
  }

  const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  const issueToken = httpsCallable(functions, 'issueTeacherToken');

  const { data } = await issueToken({
    teacherName,
    pin: opts.pin ? String(opts.pin) : '',
    refreshSession: Boolean(opts.refresh)
  });

  const token = data?.token;
  if (!token) {
    throw new Error('ไม่ได้รับ Firebase token — ตรวจสอบ Cloud Function issueTeacherToken');
  }

  await signInWithCustomToken(auth, token);
  return auth.currentUser;
}

export async function signOutFirebase() {
  const auth = getAuth(firebaseApp);
  if (auth.currentUser) {
    await signOut(auth);
  }
}

/**
 * Ensure Firestore requests include auth (after page reload).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export async function ensureFirebaseAuthForSession(session) {
  if (!session?.teacherName) return null;
  return signInFirebaseForTeacherSession(session, { refresh: true });
}
