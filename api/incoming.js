// VERSION: 2.5
const admin = require('firebase-admin');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenAI } = require('@google/genai');

// Initialize Firebase Admin
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = getFirestore();

// AI Funkce pro parsování e-mailu
async function parseEmailWithAI(preview, subject, sender) {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        return { customer: sender || '', jobName: subject, items: [] };
    }

    try {
        const prompt = `Analyzuj tento e-mail a vrať stručný JSON tiskové zakázky CML.
Subject: ${subject}
Text: ${preview}

JSON formát:
{
  "customer": "jméno zákazníka",
  "jobName": "stručný název zakázky",
  "items": [{"description": "popis", "quantity": 100}]
}`;

        const genAI = new GoogleGenAI({ apiKey });
        const result = await genAI.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt,
        });

        // Safe extraction of text from Gemini 2.0 SDK response
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanJson = generatedText.replace(/```json|```/g, '').trim();

        return JSON.parse(cleanJson);
    } catch (e) {
        console.error('AI selhalo:', e.message);
        return { customer: sender || '', jobName: subject, items: [] };
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { zakazka_id, subject, entry_id, store_id, preview, sender, received_at } = req.body;

        if (!subject || !entry_id) {
            return res.status(400).json({ error: 'Missing required fields: subject, entry_id' });
        }

        let targetOutlookId = zakazka_id || '';
        let targetJobId = ''; // Bude vyplněno až ručně

        // Pokud nemáme ID zakázky z webhooku (zakazka_id v body), zkusíme najít existující zakázku podle outlookId nebo jobId
        // Ale webhook obvykle posílá zakazka_id pokud je to k existující.
        // Pokud je zakazka_id prázdné, tvoříme novou.

        // Pokud chybí ID, zkusíme ji vytvořit přes AI
        if (!targetOutlookId) {
            console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject, sender);

            const generatedOutlookId = `OUT-${Math.floor(Date.now() / 1000).toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;

            const newJob = {
                jobId: '', // Necháme prázdné pro ruční vyplnění
                outlookId: generatedOutlookId,
                customer: aiData.customer,
                jobName: aiData.jobName,
                status: 'Poptávka',
                dateReceived: new Date().toISOString().split('T')[0],
                items: (aiData.items || []).map((it) => ({
                    id: Math.random().toString(36).substring(2, 11),
                    description: it.description || '',
                    quantity: it.quantity || 1,
                    size: '', colors: '', techSpecs: '', stockFormat: '', paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0
                })),
                position: {
                    x: 100 + Math.floor(Math.random() * 400),
                    y: 100 + Math.floor(Math.random() * 400)
                },
                isTracked: false, // NOVÉ: Nezobrazovat hned ve frontě na cestě
                entry_id: entry_id,
                store_id: store_id || '',
                zIndex: Date.now() % 1000000000, // Capped for CSS safety (max ~2.1B)
                created_at: FieldValue.serverTimestamp()
            };

            await db.collection('orders').add(newJob);
            targetOutlookId = generatedOutlookId;
            console.log('✅ Vytvořena nová karta s Outlook ID:', targetOutlookId);
        } else {
            // Pokud ID máme, ověříme existenci zakázky (hledáme v outlookId nebo jobId)
            const ordersSnapshot = await db.collection('orders')
                .where('outlookId', '==', targetOutlookId)
                .limit(1)
                .get();

            let orderDoc = ordersSnapshot.empty ? null : ordersSnapshot.docs[0];

            if (!orderDoc) {
                // Zkusíme ještě starý způsob přes jobId (kvůli zpětné kompatibilitě)
                const oldOrdersSnapshot = await db.collection('orders')
                    .where('jobId', '==', targetOutlookId)
                    .limit(1)
                    .get();
                if (!oldOrdersSnapshot.empty) {
                    orderDoc = oldOrdersSnapshot.docs[0];
                }
            }

            if (!orderDoc) {
                return res.status(404).json({ error: `Job with ID ${targetOutlookId} not found` });
            }
        }

        // Uložení e-mailu
        const emailData = {
            zakazka_id: targetOutlookId,
            subject,
            entry_id,
            store_id: store_id || '',
            preview: preview || '',
            sender: sender || '',
            received_at: received_at || '',
            created_at: new Date().toISOString(),
        };

        const emailRef = await db.collection('zakazka_emails').add(emailData);

        // Aktualizace zakázky o ID posledního e-mailu pro rychlý přístup z karty
        try {
            const ordersRef = db.collection('orders');
            // Hledáme v outlookId nebo jobId
            const orderSnap = await ordersRef.where('outlookId', '==', targetOutlookId).limit(1).get();
            let finalDoc = orderSnap.empty ? null : orderSnap.docs[0];

            if (!finalDoc) {
                const oldSnap = await ordersRef.where('jobId', '==', targetOutlookId).limit(1).get();
                if (!oldSnap.empty) finalDoc = oldSnap.docs[0];
            }

            if (finalDoc) {
                await finalDoc.ref.update({
                    lastEmailEntryId: entry_id,
                    entry_id: entry_id,
                    store_id: store_id || '',
                    lastUpdated: FieldValue.serverTimestamp()
                });
            }
        } catch (uErr) {
            console.error('Nepovinná aktualizace zakázky selhala:', uErr.message);
        }

        return res.status(200).json({
            success: true,
            outlookId: targetOutlookId,
            emailId: emailRef.id,
            message: 'Email processed successfully'
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
