import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID as string,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') as string,
    }),
  });
}

const auth = getAuth();
const db = getFirestore();

async function seed() {
  const email = 'vaidhconnect@gmail.com';
  const password = 'VaidhConnect@2026';
  const name = 'Dr. VaidhConnect';
  
  let uid;
  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    console.log(`User already exists with UID: ${uid}`);
    
    await auth.updateUser(uid, { password });
    console.log(`Password updated for ${email}`);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      const user = await auth.createUser({
        email,
        password,
        displayName: name,
      });
      uid = user.uid;
      console.log(`Created new user with UID: ${uid}`);
    } else {
      throw error;
    }
  }

  const docRef = db.collection('doctors').doc(uid);
  await docRef.set({
    name,
    email,
    clinicName: 'VaidhConnect Clinic',
    specialty: 'Ayurveda',
    themeColor: '#10B981', // green for ayurveda
    slotDurationMins: 15,
    registrationNumber: 'REG-12345',
    timings: {
      monday: { open: true, morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
      tuesday: { open: true, morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
      wednesday: { open: true, morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
      thursday: { open: true, morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
      friday: { open: true, morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
      saturday: { open: true, morning: { start: '09:00', end: '14:00' } },
      sunday: { open: false },
    },
    reminderIntervals: [24, 2],
    pageViews: 0,
    youtubeLinks: [],
    products: [],
    paymentDetails: {}
  }, { merge: true });

  console.log(`Successfully created/updated doctor profile for ${email}`);
}

seed().catch(console.error);
