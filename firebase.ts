import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyAeGu3urs7UX39j1u0XW0xfuznE2wrw81E",
    authDomain: "calamarus-907d7.firebaseapp.com",
    projectId: "calamarus-907d7",
    storageBucket: "calamarus-907d7.firebasestorage.app",
    messagingSenderId: "633852995295",
    appId: "1:633852995295:web:fe1b709501373e6e5deb6a"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const PUBLIC_ORDERS_COLLECTION = 'orders'; // Toto zůstává pro zpětnou kompatibilitu symbolu, ale budeme používat nové názvy
const BOARD_CARDS_COLLECTION = 'cml_board_cards';
const INVITES_COLLECTION = 'invites';

export { auth, db, PUBLIC_ORDERS_COLLECTION, BOARD_CARDS_COLLECTION, INVITES_COLLECTION };
