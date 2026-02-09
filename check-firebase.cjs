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
    console.log('🔍 Kontrola nedávných dat v Firebase...\n');

    // Zkontrolovat nedávné zakázky
    const ordersSnapshot = await db.collection('orders')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();

    console.log(`📦 Posledních 10 zakázek:`);
    ordersSnapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.created_at?.toDate?.() || 'N/A';
        console.log(`  - ${data.jobId}: ${data.customer} - ${data.jobName}`);
        console.log(`    Status: ${data.status}, Vytvořeno: ${createdAt}`);
    });

    // Zkontrolovat e-maily
    const emailsSnapshot = await db.collection('zakazka_emails')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();

    console.log(`\n📧 Posledních 10 e-mailů:`);
    emailsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - ID zakázky: ${data.zakazka_id}`);
        console.log(`    Subject: ${data.subject}`);
        console.log(`    Vytvořeno: ${data.created_at}`);
    });


    // Zkontrolovat e-maily s prázdným zakazka_id
    const emptyIdSnapshot = await db.collection('zakazka_emails')
        .where('zakazka_id', '==', '')
        .get();

    console.log(`\n⚠️ E-maily s prázdným zakazka_id: ${emptyIdSnapshot.size}`);
    emptyIdSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - Subject: ${data.subject}`);
        console.log(`    Entry ID: ${data.entry_id.substring(0, 30)}...`);
    });

    process.exit(0);
}

checkRecentData().catch(err => {
    console.error('❌ Chyba:', err);
    process.exit(1);
});
