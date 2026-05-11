// VERSION: 2.6 - Sandbox fix
const admin = require('firebase-admin');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenAI } = require('@google/genai');

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
console.log('KEY_CHECK:', privateKey?.substring(0, 50));
console.log('EMAIL_CHECK:', process.env.FIREBASE_CLIENT_EMAIL);

const app = getApps().length 
    ? getApps()[0] 
    : initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
    });

const db = getFirestore(app);

// Detekce sandbox módu
const IS_SANDBOX = process.env.VITE_MOCK_MODE === 'true';

// Kolekce podle prostředí
const CARDS_COLLECTION = IS_SANDBOX ? 'cml_board_cards_sandbox' : 'cml_board_cards';
const EMAILS_COLLECTION = IS_SANDBOX ? 'zakazka_emails_sandbox' : 'zakazka_emails';
const ID_PREFIX = IS_SANDBOX ? 'SBX' : 'OUT';

console.log(`🔧 Mode: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'} | Cards: ${CARDS_COLLECTION} | Emails: ${EMAILS_COLLECTION}`);

// AI Funkce pro parsování e-mailu
async function parseEmailWithAI(preview, subject, sender) {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        return { customer: sender || '', jobName: subject, items: [] };
    }

    try {
        const prompt = `Jsi asistent tiskárny. Analyzuj tento e-mail a vrať stručný JSON tiskové zakázky CML.
DŮLEŽITÉ:
1. Pro barevnost (colors) používej VŽDY technický zápis (např. '4/4', '4/0').
2. Do technických poznámek (techSpecs) NEPIŠ věci, které už jsou v jiných polích (např. nepiš název tiskoviny nebo barevnost, pokud už je to v 'description' nebo 'colors').
3. Pokud pro pole nemáš data, použij prázdný řetězec "", nikdy nevracej "null" nebo null.

Subject: ${subject}
Text: ${preview}

JSON formát:
{
  "customer": "jméno zákazníka",
  "jobName": "stručný název zakázky",
  "items": [{"description": "popis", "quantity": 100, "colors": "4/4", "techSpecs": ""}]
}`;

        const genAI = new GoogleGenAI({ apiKey });
        const result = await genAI.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt,
        });

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

        // Funkce pro nalezení zakázky ve správné kolekci
        async function findJobDoc(id) {
            // 1. Hledání podle outlookId
            const snap = await db.collection(CARDS_COLLECTION).where('outlookId', '==', id).limit(1).get();
            if (!snap.empty) return snap.docs[0];

            // 2. Hledání podle jobId (pro manuálně vytvořené karty nebo přejmenované)
            const oldSnap = await db.collection(CARDS_COLLECTION).where('jobId', '==', id).limit(1).get();
            if (!oldSnap.empty) {
                const doc = oldSnap.docs[0];
                // Automatické spárování: doplníme outlookId pokud chybí
                if (!doc.data().outlookId) {
                    console.log(`🔗 Automatické spárování: doplňuji outlookId ${id} k zakázce ${doc.data().jobId}`);
                    await doc.ref.update({ outlookId: id });
                }
                return doc;
            }

            return null;
        }

        let existingJobDoc = null;

        if (!targetOutlookId) {
            console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject, sender);

            const generatedOutlookId = `${ID_PREFIX}-${Math.floor(Date.now() / 1000)}`;

            const newJob = {
                jobId: '',
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
                isTracked: false,
                entry_id: entry_id,
                store_id: store_id || '',
                zIndex: Date.now() % 1000000000,
                created_at: FieldValue.serverTimestamp(),
                _sandbox: IS_SANDBOX
            };

            await db.collection(CARDS_COLLECTION).add(newJob);
            targetOutlookId = generatedOutlookId;
            console.log(`✅ Vytvořena nová karta [${IS_SANDBOX ? 'SANDBOX' : 'PROD'}] s ID:`, targetOutlookId);
        } else {
            existingJobDoc = await findJobDoc(targetOutlookId);
            if (!existingJobDoc) {
                return res.status(404).json({ error: `Job with ID ${targetOutlookId} not found` });
            }
            targetOutlookId = existingJobDoc.data().outlookId || targetOutlookId;
        }

        // Uložení e-mailu do správné kolekce
        const emailData = {
            zakazka_id: targetOutlookId,
            subject,
            entry_id,
            store_id: store_id || '',
            preview: preview || '',
            sender: sender || '',
            received_at: received_at || '',
            created_at: new Date().toISOString(),
            _sandbox: IS_SANDBOX
        };

        const emailRef = await db.collection(EMAILS_COLLECTION).add(emailData);
        console.log(`📧 Email uložen do ${EMAILS_COLLECTION} s ID:`, emailRef.id);

        // Aktualizace nalezené zakázky o metadata e-mailu
        if (existingJobDoc) {
            try {
                await existingJobDoc.ref.update({
                    lastEmailEntryId: entry_id,
                    entry_id: entry_id,
                    store_id: store_id || '',
                    lastUpdated: FieldValue.serverTimestamp()
                });
            } catch (uErr) {
                console.error('Nepovinná aktualizace zakázky selhala:', uErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            outlookId: targetOutlookId,
            emailId: emailRef.id,
            mode: IS_SANDBOX ? 'sandbox' : 'production',
            message: 'Email processed successfully'
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};