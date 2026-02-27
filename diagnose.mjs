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

async function checkCollections() {
    console.log('--- DIAGNOSTIKA DATABÁZE ---');

    const collections = ['orders', 'cml_board_cards'];

    for (const collName of collections) {
        console.log(`\nKolekce: ${collName}`);
        try {
            const querySnapshot = await getDocs(collection(db, collName));
            console.log(`Počet dokumentů: ${querySnapshot.size}`);

            if (querySnapshot.size > 0) {
                console.log('Ukázka (prvních 5):');
                querySnapshot.docs.slice(0, 5).forEach(doc => {
                    const data = doc.data();
                    console.log(`- ID: ${doc.id}, jobId: ${data.jobId}, customer: ${data.customer}`);
                });
            }
        } catch (e) {
            console.error(`Chyba při čtení ${collName}:`, e.message);
        }
    }
}

checkCollections();
