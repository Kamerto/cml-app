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
async function parseEmailWithAI(preview: string, subject: string) {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        return { customer: 'Neznámý (Outlook)', jobName: subject, items: [] };
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
    } catch (e: any) {
        console.error('AI selhalo:', e.message);
        return { customer: 'Neznámý (Outlook)', jobName: subject, items: [] };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { zakazka_id, subject, entry_id, store_id, preview } = req.body;

        if (!subject || !entry_id) {
            return res.status(400).json({ error: 'Missing required fields: subject, entry_id' });
        }

        let targetJobId = zakazka_id;

        // Pokud chybí ID zakázky, zkusíme ji vytvořit přes AI
        if (!targetJobId) {
            console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject);

            const newJob = {
                jobId: `OUT-${Math.floor(Date.now() / 100000)}`,
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
                isTracked: true,
                entry_id: entry_id,
                store_id: store_id || '',
                created_at: FieldValue.serverTimestamp()
            };

            await db.collection('orders').add(newJob);
            targetJobId = newJob.jobId;
            console.log('✅ Vytvořena nová karta:', targetJobId);
        } else {
            // Pokud ID máme, ověříme existenci
            const ordersSnapshot = await db.collection('orders')
                .where('jobId', '==', targetJobId)
                .limit(1)
                .get();

            if (ordersSnapshot.empty) {
                return res.status(404).json({ error: `Job with ID ${targetJobId} not found` });
            }
        }

        // Uložení e-mailu
        const emailData = {
            zakazka_id: targetJobId,
            subject,
            entry_id,
            store_id: store_id || '',
            preview: preview || '',
            created_at: new Date().toISOString(),
        };

        const emailRef = await db.collection('zakazka_emails').add(emailData);

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
