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

        // Funkce pro nalezení zakázky v obou kolekcích
        async function findJobDoc(id) {
            const collections = ['cml_board_cards', 'orders_sandbox'];
            for (const colName of collections) {
                // 1. Primární hledání podle technického outlookId
                const snap = await db.collection(colName).where('outlookId', '==', id).limit(1).get();
                if (!snap.empty) return snap.docs[0];

                // 2. Sekundární hledání podle evidenčního jobId (pro první spárování nebo staré zakázky)
                const oldSnap = await db.collection(colName).where('jobId', '==', id).limit(1).get();
                if (!oldSnap.empty) {
                    const doc = oldSnap.docs[0];
                    // AUTOMATIKA: Pokud zakázka ještě nemá outlookId, rovnou ho tam zapíšeme
                    if (!doc.data().outlookId) {
                        console.log(`🔗 Automatické spárování: doplňuji outlookId ${id} k zakázce ${doc.data().jobId}`);
                        await doc.ref.update({ outlookId: id });
                    }
                    return doc;
                }
            }
            return null;
        }

        let existingJobDoc = null;

        if (!targetOutlookId) {
            console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject, sender);

            const generatedOutlookId = `OUT-${Math.floor(Date.now() / 1000).toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;

            const newJob = {
                jobId: '', // Evidenční číslo (uživatel vyplní ručně)
                outlookId: generatedOutlookId, // Technický link pro Outlook
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
                created_at: FieldValue.serverTimestamp()
            };

            await db.collection('cml_board_cards').add(newJob);
            targetOutlookId = generatedOutlookId;
            console.log('✅ Vytvořena nová karta s Outlook ID:', targetOutlookId);
        } else {
            existingJobDoc = await findJobDoc(targetOutlookId);
            if (!existingJobDoc) {
                return res.status(404).json({ error: `Job with ID ${targetOutlookId} not found` });
            }
            // Použijeme outlookId z dokumentu (pokud tam je), jinak to co přišlo
            targetOutlookId = existingJobDoc.data().outlookId || targetOutlookId;
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
        } else {
            // Pro nově vytvořenou kartu už metadata máme v objektu při creatu (pokud bychom ji neaktualizovali hned znovu)
            // Ale pro jistotu můžeme zkusit najít tu čerstvě vytvořenou, pokud by bylo potřeba.
            // Aktuálně se metadata vkládají přímo do newJob při creation.
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
