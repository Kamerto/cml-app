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

async function inspectCmlCards() {
    console.log('--- DETAILNÍ INSPEKCE CML_BOARD_CARDS ---');
    try {
        const snap = await getDocs(collection(db, 'cml_board_cards'));
        console.log(`Počet v cml_board_cards: ${snap.size}`);
        snap.forEach(d => {
            console.log(JSON.stringify({ id: d.id, ...d.data() }, null, 2));
        });
    } catch (e) {
        console.error(e);
    }
}

async function inspectEmails() {
    console.log('\n--- ANALÝZA EMAILŮ PRO OBNOVU ---');
    try {
        const snap = await getDocs(collection(db, 'zakazka_emails'));
        console.log(`Počet emailů: ${snap.size}`);
        const jobsToRestore = new Map();

        snap.forEach(d => {
            const data = d.data();
            if (data.zakazka_id && !data.zakazka_id.includes('???')) {
                if (!jobsToRestore.has(data.zakazka_id)) {
                    jobsToRestore.set(data.zakazka_id, {
                        jobId: data.zakazka_id,
                        customer: data.customer || data.sender || 'Neznámý',
                        dateReceived: data.received_at ? data.received_at.split('T')[0] : new Date().toISOString().split('T')[0],
                        subject: data.subject,
                        status: 'INQUIRY',
                        position: { x: 100, y: 100 },
                        isTracked: false,
                        items: []
                    });
                }
            }
        });

        console.log(`Nalezeno ${jobsToRestore.size} potenciálních zakázek k obnově z emailů.`);
        console.log('Ukázka ID k obnově:', Array.from(jobsToRestore.keys()).slice(0, 5));
    } catch (e) {
        console.error(e);
    }
}

async function run() {
    await inspectCmlCards();
    await inspectEmails();
}

run();
