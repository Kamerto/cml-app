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

// --- SANDBOX KOLEKCE (izolované od produkce) ---
const SANDBOX_BOARD = 'cml_board_cards_sandbox';
const SANDBOX_EMAILS = 'zakazka_emails_sandbox';

async function parseEmailWithAI(preview: string, subject: string, sender: string) {
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

    console.log('🧪 SANDBOX webhook volán');

    try {
        const { zakazka_id, subject, entry_id, store_id, preview, sender } = req.body;

        if (!subject || !entry_id) {
            return res.status(400).json({ error: 'Missing required fields: subject, entry_id' });
        }

        let targetJobId = zakazka_id;

        if (!targetJobId) {
            console.log('✨ [SANDBOX] Nová zakázka přes AI...');
            const aiData = await parseEmailWithAI(preview || '', subject, sender || '');

            const newJob = {
                jobId: `SBX-${Math.floor(Date.now() / 100000)}`,
                customer: aiData.customer,
                jobName: aiData.jobName,
                status: 'Poptávka',
                dateReceived: new Date().toISOString().split('T')[0],
                items: (aiData.items || []).map((it: any) => ({
                    id: Math.random().toString(36).substring(2, 11),
                    description: it.description || '',
                    quantity: it.quantity || 1,
                    size: '', colors: '', techSpecs: '', stockFormat: '',
                    paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0
                })),
                position: { x: 100, y: 100 },
                isTracked: false,
                entry_id,
                store_id: store_id || '',
                _sandbox: true,
                created_at: FieldValue.serverTimestamp()
            };

            await db.collection(SANDBOX_BOARD).add(newJob);
            targetJobId = newJob.jobId;
            console.log('✅ [SANDBOX] Vytvořena karta:', targetJobId);
        } else {
            const snap = await db.collection(SANDBOX_BOARD)
                .where('jobId', '==', targetJobId)
                .limit(1)
                .get();

            if (snap.empty) {
                return res.status(404).json({ error: `[SANDBOX] Job ${targetJobId} not found` });
            }
        }

        const emailData = {
            zakazka_id: targetJobId,
            subject,
            entry_id,
            store_id: store_id || '',
            preview: preview || '',
            sender: sender || '',
            _sandbox: true,
            created_at: new Date().toISOString(),
        };

        const emailRef = await db.collection(SANDBOX_EMAILS).add(emailData);

        return res.status(200).json({
            success: true,
            jobId: targetJobId,
            emailId: emailRef.id,
            sandbox: true,
            message: '[SANDBOX] Email processed successfully'
        });

    } catch (error: any) {
        console.error('[SANDBOX] Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}