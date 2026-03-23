import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDF67ONQw-t5mP_V3rozjdy-FLbUq9jLdw",
  authDomain: "to21-9034c.firebaseapp.com",
  projectId: "to21-9034c",
  storageBucket: "to21-9034c.firebasestorage.app",
  messagingSenderId: "182276029554",
  appId: "1:182276029554:web:2bf14dd9acc1f57a3bd6eb",
  measurementId: "G-YNSJYY8PC5W"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
