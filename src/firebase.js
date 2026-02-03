// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB4x6bh3kCPhy5tkZkeLk8d1o2wLbkiFRs",
  authDomain: "custeio-derivado-a3698.firebaseapp.com",
  projectId: "custeio-derivado-a3698",
  storageBucket: "custeio-derivado-a3698.firebasestorage.app",
  messagingSenderId: "342745301178",
  appId: "1:342745301178:web:bb3e19d11718937e6d8283",
  measurementId: "G-2FZZRF5MZF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
