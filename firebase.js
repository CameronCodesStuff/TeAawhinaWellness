// Firebase — Te Aawhina Wellness
// Shared init for the public site and the admin portal.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCbfx0siKAL8pPE8PPJg7xp-vwa5US04To",
  authDomain: "teaawhinawellness-d2349.firebaseapp.com",
  projectId: "teaawhinawellness-d2349",
  storageBucket: "teaawhinawellness-d2349.firebasestorage.app",
  messagingSenderId: "352409512370",
  appId: "1:352409512370:web:e0f21daa7c17bbae239cab",
  measurementId: "G-8BYCSZ2NEB"
};

// Accounts that can access the admin portal and receive booking alerts.
// Must match the admin list in firestore.rules and in the worker.
export const ADMIN_EMAILS = ["detlaffcameron@gmail.com"];

// Cloudflare Worker that sends the Twilio SMS (see worker/ folder).
// Update this after you deploy the worker.
export const SMS_ENDPOINT = "https://curly-bonus-8097.detlaffcameron.workers.dev/send";

const app = initializeApp(firebaseConfig);
isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export function isAdminUser(user) {
  return !!user && ADMIN_EMAILS.includes(user.email) && user.emailVerified;
}

// Deterministic slot doc id — this is what makes double-booking impossible:
// two people booking the same slot both try to create the same doc,
// and Firestore only lets one batch succeed.
export function slotId(dateKey, time) {
  return dateKey + "_" + time.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
};
