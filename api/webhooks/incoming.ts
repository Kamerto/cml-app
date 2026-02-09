import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { zakazka_id, subject, entry_id, preview } = req.body;

        // Validate required fields
        if (!zakazka_id || !subject || !entry_id) {
            return res.status(400).json({ error: 'Missing required fields: zakazka_id, subject, entry_id' });
        }

        // Check if job exists
        const ordersSnapshot = await db.collection('orders')
            .where('jobId', '==', zakazka_id)
            .limit(1)
            .get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ error: `Job with ID ${zakazka_id} not found` });
        }

        // Create email record
        const emailData = {
            zakazka_id,
            subject,
            entry_id,
            preview: preview || '',
            created_at: new Date().toISOString(),
        };

        const emailRef = await db.collection('zakazka_emails').add(emailData);

        return res.status(200).json({
            success: true,
            id: emailRef.id,
            message: 'Email linked to job successfully'
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
