const admin = require('firebase-admin');

const envVars = {
    FIREBASE_PROJECT_ID: "calamarus-907d7",
    FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-fbsvc@calamarus-907d7.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCoq1We7WWDbUc/\\nZE2bhsQa6q263M+2htl62s9ujidbrg5bb4U+DJV9asfQGxlifabLsDTpOLT915TA\\nCOX5xrjhw7LKB/Oei3BkFAT0x5Nvr1GKhbkuod/GbECO8dObTZzBfRjqxvNviXJu\\nf7UFfLRtTs7L2ZA6xS1FeDQ4Q2N/1qMbIxta9PoFHc80fdsVd11ZywxvQ5lnL5o2\\n5sC2cr+sM3qxVZJty7UEQMll3EuTNkApgKcIB6pgaIZNwlAmIdrJETskDNQf6zOa\\nGYoFOYzUYMhItT4oZ8k0rr+wi1/mM0wBYME/eObHbaCzibe1xdc4qTZQs7p9oG5t\\njmaMh8MXAgMBAAECggEAA6jyt1+bi261hkpx2jt+DHxYB6/o1s+17wE5MBwUg8XQ\\nKDPFNck2uhOIqFhraJficqt7Hp15yPsY7PPrbyqwN/zdjpL98fjcnY9SWAk9TyoP\\nQa+hUyYRHCPqxMseYsv6xs2fmBiZbfQS9a8J0dhQSOtx5zoj88EgcBiZCBfcKm0/\\n04gfPSz+4d/3BE+mae6x+BzORTdBzirqPw2KiyvDQ5tssHKdWKNE/WssNSNlPho6\\nOQpr2BDCxCExpJa95fmuD7WR8P4QV61Gvd2v8vTBWlJbi/xj1xTTI7RigRcUAf+4\\n3wKLPnK4Rtz080iks66YpQ/usHAFKwEBvfFjK9VE4QKBgQDR+5Ix7QowuWpueuNg\\nGaAdr2pm5KiPfOGEKLpFsvHELidp1clbNoMkNDTl41P9mqEZdqSsbyRtPavmEKXc\\nutkOw56reU4RVzAIRIwOhiy23xQukMsR0sNIs+wSexIfFTE1B21y9JIu6XlSEVcO\\nuSwC+wukm8Ci5nWH2mCB3VYglQKBgQDNogBuQHqyFMaovqos/n16HJ6M8hVIPfws\\nnjnHzr4oJ/gJ1iGyw5YCPY++guK61rWm+KcRGQt9wBA14T+xh2lhm6ntsPFtIIHZ\\nNoMzL48s2HxqLdRaG2qfNs3k27Zi93iKempudFfPiDtgh4TYK8A3M7ZgxP361pSV\\nzaFXjOVN+wKBgF1HbQ1CqIk2hMIpUwJov8kQGKs2nm6HYkLsOLsnn+CvRBDuyHD9\\niUo26tzInJIG89O08bgr8zmX8NnVwWiJlEzLt5ui2nw3h/3UPYdiMVDXTkbVSXBU\\neS29x3v6MfWe22ocL5GmdZ3jV2KOk2bV+Wglj2mDSxLSX5mG9+IYqd71AoGAArH7\\n5XYM5aamD/In0t0nEeGsJlbJ9p9xXbhZM4g/L9GOS7q1yF0N60uZRbr7c816pgye\\nS/gTEXvh+oLQTehjdjcPHCF0mKSTbyBqydH2w3S29MFTBjdTx3B1dGl404VA3DfM\\ni1QVDpBPju1XzWmNZGvWGSCb35zOZ8RBOB+Npd8CgYBb+hTPe3pmHFrAatXOHkiP\\neJfMKzGeG/zJTlqeDRGNSFrB7W0DaAkKAg4FFA24qDzo90Xx7KLMOV/K+whHvv2c\\nlbTL0jsdqyZB9fp+h/zxkpk0AwQcDlPELc/RcJ2+dOpyasRUGQkiwg/TcP/C6UOl\\nFY4OGQDlUJ/2sRKrp3fSRA==\\n-----END PRIVATE KEY-----\\n"
};

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

async function restore() {
    console.log('--- RESTORING ORDERS FROM EMAILS (BROADENED) ---');
    const emailSnap = await db.collection('zakazka_emails').get();

    let count = 0;
    for (const doc of emailSnap.docs) {
        const data = doc.data();
        let subject = (data.subject || "").trim();

        // Clean up common prefixes
        subject = subject.replace(/^(FW|RE|Odpověď|Předáno):\s+/i, '').trim();

        // Pattern match: "169/26 ...", "146/25 ...", "152/26 ..."
        // Try to find N/YY anywhere if it looks like a pytlík number
        let orderNumber = "";
        let clientName = "";
        let notes = "";

        // Strategy 1: Look for N/YY at the start
        const startMatch = subject.match(/^(\d{1,4}\/\d{2,4})\b/);
        if (startMatch) {
            orderNumber = startMatch[1];
            let rest = subject.substring(startMatch[0].length).trim();
            rest = rest.replace(/^[:\-]\s*/, '').trim(); // Remove separators
            rest = rest.replace(/OBJEDNÁVKA/i, '').trim();

            if (rest.includes(',')) {
                const parts = rest.split(',');
                clientName = parts[0].trim();
                notes = parts.slice(1).join(',').trim();
            } else if (rest.includes(':')) {
                const parts = rest.split(':');
                clientName = parts[0].trim();
                notes = parts.slice(1).join(':').trim();
            } else {
                clientName = rest;
            }
        } else if (subject.toUpperCase().includes('OBJEDNÁVKA')) {
            // Strategy 2: If it's an order but no N/YY start, use jobId as fallback and subject as client
            orderNumber = data.zakazka_id || "???";
            clientName = subject.replace(/OBJEDNÁVKA/i, '').trim();
        } else {
            // Strategy 3: Just use jobId and subject
            orderNumber = data.zakazka_id || "???";
            clientName = subject;
        }

        if (orderNumber && clientName && (orderNumber !== "???" || subject.toUpperCase().includes('OBJEDNÁVKA'))) {
            console.log(`Found: ${orderNumber} | Client: ${clientName} | Notes: ${notes}`);

            const existing = await db.collection('orders').where('orderNumber', '==', orderNumber).get();
            if (existing.empty) {
                await db.collection('orders').add({
                    orderNumber,
                    clientName,
                    notes,
                    currentStage: "studio",
                    isCompleted: false,
                    isUrgent: false,
                    deliveryDate: data.received_at ? data.received_at.split('T')[0] : new Date().toISOString().split('T')[0],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    recoveredFromEmail: doc.id,
                    restoration_v: '3'
                });
                count++;
            }
        } else {
            console.log(`SKIPPED: [${subject}] | ID: ${data.zakazka_id}`);
        }
    }

    console.log(`\n--- FINISH: Restored ${count} additional potential orders. ---`);
}

restore().catch(console.error);
