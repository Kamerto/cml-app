import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

const firebaseConfig = {
    apiKey: "AIzaSyAeGu3urs7UX39j1u0XW0xfuznE2wrw81E",
    authDomain: "calamarus-907d7.firebaseapp.com",
    projectId: "calamarus-907d7",
    storageBucket: "calamarus-907d7.firebasestorage.app",
    messagingSenderId: "633852995295",
    appId: "1:633852995295:web:fe1b709501373e6e5deb6a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkEmails() {
    console.log('--- KONTROLA EMAILLŮ ---');
    try {
        const querySnapshot = await getDocs(collection(db, 'zakazka_emails'));
        console.log(`Počet emailů: ${querySnapshot.size}`);

        const jobIds = new Set();
        querySnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.zakazka_id) jobIds.add(data.zakazka_id);
        });

        console.log(`Unikátní ID zakázek v emailech (${jobIds.size}):`);
        console.log(Array.from(jobIds).join(', '));
    } catch (e) {
        console.error('Chyba:', e.message);
    }
}

checkEmails();
