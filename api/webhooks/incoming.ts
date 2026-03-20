import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

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
async function parseEmailWithAI(preview: string, subject: string, sender: string) {
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

        // Safe extraction of text from Gemini 2.0 SDK response
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanJson = generatedText.replace(/```json|```/g, '').trim();

        return JSON.parse(cleanJson);
    } catch (e: any) {
        console.error('AI selhalo:', e.message);
        return { customer: sender || '', jobName: subject, items: [] };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { zakazka_id, subject, entry_id, store_id, preview, sender } = req.body;

        if (!subject || !entry_id) {
            return res.status(400).json({ error: 'Missing required fields: subject, entry_id' });
        }

        let targetJobId = zakazka_id;

        // Detekce módu (sandbox vs produkce)
        const isSandbox = process.env.VITE_MOCK_MODE === 'true';
        const cardsCollection = isSandbox ? 'cml_board_cards_sandbox' : 'cml_board_cards';
        const emailsCollection = isSandbox ? 'zakazka_emails_sandbox' : 'zakazka_emails';

        // Pokud chybí ID zakázky, zkusíme ji vytvořit přes AI
        if (!targetJobId) {
            console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject, sender || '');

            const idPrefix = isSandbox ? 'SBX' : 'OUT';
            const generatedOutlookId = `${idPrefix}-${Math.floor(Date.now() / 1000)}`;

            const newJob = {
                jobId: '',
                outlookId: generatedOutlookId,
                customer: aiData.customer,
                jobName: aiData.jobName,
                status: 'Poptávka',
                dateReceived: new Date().toISOString().split('T')[0],
                items: (aiData.items || []).map((it: any) => ({
                    id: Math.random().toString(36).substring(2, 11),
                    description: it.description || '',
                    quantity: it.quantity || 1,
                    size: '', colors: '', techSpecs: '', stockFormat: '', paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0
                })),
                position: { x: 100, y: 100 },
                isTracked: false, 
                entry_id: entry_id,
                store_id: store_id || '',
                created_at: FieldValue.serverTimestamp()
            };

            await db.collection(cardsCollection).add(newJob);
            targetJobId = generatedOutlookId; 
            console.log('✅ Vytvořena nová karta:', targetJobId);
        } else {
            // Pokud ID máme, ověříme existenci v BOARD kolekci
            // 1. Nejprve zkusíme outlookId
            let snap = await db.collection(cardsCollection).where('outlookId', '==', targetJobId).limit(1).get();
            
            // 2. Pokud nic, zkusíme jobId
            if (snap.empty) {
                snap = await db.collection(cardsCollection).where('jobId', '==', targetJobId).limit(1).get();
            }

            if (snap.empty) {
                return res.status(404).json({ error: `Job with ID ${targetJobId} not found in ${cardsCollection}` });
            }

            // Použijeme outlookId z dokumentu pokud existuje (pro trvalé párování)
            targetJobId = snap.docs[0].data().outlookId || targetJobId;
        }

        // Uložení e-mailu
        const emailData = {
            zakazka_id: targetJobId,
            subject,
            entry_id,
            store_id: store_id || '',
            preview: preview || '',
            sender: sender || '',
            created_at: new Date().toISOString(),
        };

        const emailRef = await db.collection(emailsCollection).add(emailData);

        return res.status(200).json({
            success: true,
            jobId: targetJobId,
            emailId: emailRef.id,
            message: 'Email processed successfully'
        });

    } catch (error: any) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
