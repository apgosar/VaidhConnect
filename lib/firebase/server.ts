import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

// `next build` imports every route module (even ones marked force-dynamic)
// to collect route metadata, which runs this file's top-level code — but
// no real credentials are available in the build container by design (see
// .gcloudignore). Route handler bodies never execute during that step, so
// it's safe to skip initialization entirely during the build phase; real
// credentials are injected at runtime via Secret Manager instead.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildPhase && !getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines for private key parsing
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.GCS_BUCKET_NAME,
    });
    // Set Firestore settings once at initialization
    getFirestore().settings({ ignoreUndefinedProperties: true });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

// Explicit type annotations here matter: without them, TypeScript infers
// the exported type as the union of both ternary branches, and `any`
// absorbs everything in a union — silently widening these to `any`
// everywhere they're used across the app and defeating type-checking on
// every downstream `.filter()`/`.map()` callback. The `as unknown as X`
// casts keep the declared type as the real SDK type; during the build
// phase these are never actually called (see above), so the cast is
// safe — outside the build phase, a missing app throws here immediately
// with a clear error instead of failing confusingly downstream.
export const adminAuth: Auth = isBuildPhase ? (undefined as unknown as Auth) : getAuth();
export const adminDb: Firestore = isBuildPhase ? (undefined as unknown as Firestore) : getFirestore();
export const adminStorage: Storage = isBuildPhase ? (undefined as unknown as Storage) : getStorage();
