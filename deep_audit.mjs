import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit } from 'firebase/firestore/lite';

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

async function deepAudit() {
    console.log('--- HLOUBKOVÁ AUDIT DATABÁZE ---');

    // Zkusíme běžné názvy kolekcí
    const suspectedNames = ['orders', 'cml_board_cards', 'zakazky', 'jobs', 'tracking', 'public_orders', 'zakazka_emails'];

    for (const collName of suspectedNames) {
        try {
            const snap = await getDocs(collection(db, collName));
            console.log(`Kolekce [${collName}]: ${snap.size} dokumentů`);
            if (snap.size > 0) {
                const first = snap.docs[0].data();
                console.log(`  - Příklad ID: ${snap.docs[0].id}, jobId: ${first.jobId || 'N/A'}, customer: ${first.customer || 'N/A'}`);
            }
        } catch (e) {
            // console.log(`Kolekce [${collName}]: neexistuje nebo nepovolen přístup`);
        }
    }

    console.log('\n--- KONTROLA RECENTNÍCH EMAILŮ ---');
    try {
        const emailSnap = await getDocs(collection(db, 'zakazka_emails'));
        console.log(`Celkem emailů: ${emailSnap.size}`);
        // Seřadíme podle času (pokud je pole)
        const emails = emailSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('Posledních 5 emailů linkovaných k zakázkám:');
        emails.slice(-5).forEach(e => {
            console.log(`  - ${e.received_at || '???'}: ${e.zakazka_id} (${e.customer || e.sender})`);
        });
    } catch (e) {
        console.error('Chyba při kontrole emailů:', e.message);
    }
}

deepAudit();
