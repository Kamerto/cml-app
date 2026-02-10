const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Načtení .env.local manuálně
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
});

// Inicializace Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: envVars.FIREBASE_PROJECT_ID,
            clientEmail: envVars.FIREBASE_CLIENT_EMAIL,
            privateKey: envVars.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

async function checkRecentData() {
    console.log('🔍 Kontrola dat v Firebase...\n');

    const specificId = 'OUT-369-106';
    const specificSnapshot = await db.collection('orders').where('jobId', '==', specificId).get();

    if (!specificSnapshot.empty) {
        console.log(`✅ NALEZENA ZAKÁZKA ${specificId}:`);
        specificSnapshot.forEach(doc => {
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    } else {
        console.log(`❌ ZAKÁZKA ${specificId} NENALEZENA.`);
    }

    // Zakázky
    const allOrders = await db.collection('orders').get();
    console.log(`📊 Celkem zakázek v DB: ${allOrders.size}`);

    // Zkontrolovat nedávné zakázky
    const ordersSnapshot = await db.collection('orders')
        .orderBy('created_at', 'desc')
        .limit(5)
        .get();

    console.log(`📦 Posledních 5 zakázek:`);
    ordersSnapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.created_at?.toDate?.() || 'N/A';
        console.log(`  - ${data.jobId}: ${data.customer} - ${data.jobName} (Status: ${data.status})`);
    });

    process.exit(0);
}

checkRecentData().catch(err => {
    console.error('❌ Chyba:', err);
    process.exit(1);
});
