const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Načtení environment variables z .env.local
try {
    const dotenv = require('dotenv');
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('Environment variables načteny z .env.local');
    } else {
        console.warn('.env.local nenalezen.');
    }
} catch (e) {
    console.warn('Hlásím: dotenv není nainstalován, proměnné se nenačetly.');
}

// Firebase Admin initialization
let admin;
let db = null;
try {
    admin = require('firebase-admin');
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: projectId,
                    clientEmail: clientEmail,
                    privateKey: privateKey.replace(/\\n/g, '\n'),
                }),
            });
            db = admin.firestore();
            console.log('✅ Firebase Admin úspěšně inicializován.');
        } else {
            db = admin.app().firestore();
        }
    } else {
        console.warn('⚠️ Firebase Admin NEBYL inicializován - chybí proměnné v .env.local');
    }
} catch (e) {
    console.warn('⚠️ Chyba při inicializaci Firebase Admin:', e.message);
}

const { GoogleGenAI } = require('@google/genai');

const PORT = 3005;

// AI Funkce pro parsování e-mailu
async function parseEmailWithAI(preview, subject) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        return { customer: 'Neznámý (Outlook)', jobName: subject, items: [] };
    }

    try {
        const genAI = new GoogleGenAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Analyzuj tento e-mail a vrať stručný JSON pro tiskovou zakázku.
Subject: ${subject}
Text: ${preview}

JSON formát:
{
  "customer": "jméno zákazníka",
  "jobName": "stručný název zakázky",
  "items": [{"description": "popis", "quantity": 100}]
}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        console.error('AI selhalo:', e.message);
        return { customer: 'Neznámý (Outlook)', jobName: subject, items: [] };
    }
}

const handleWebhook = async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const payload = JSON.parse(body);
            const { zakazka_id, subject, entry_id, preview } = payload;
            console.log('📨 Přijat e-mail z Outlooku:', subject);

            if (!db) {
                console.warn('❌ ERROR: Databáze není připojená. Data nebyla uložena.');
                // Uložíme aspoň pro debug do lokálního souboru
                fs.appendFileSync('webhook_log.json', JSON.stringify({ timestamp: new Date(), ...payload }) + '\n');

                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Database not connected. Check .env.local' }));
                return;
            }

            let targetJobId = zakazka_id;

            if (!targetJobId) {
                console.log('✨ Zakázka nemá ID, tvořím novou přes AI...');
                const aiData = await parseEmailWithAI(preview, subject);

                const newJob = {
                    jobId: `OUT-${Math.floor(Date.now() / 100000)}`,
                    customer: aiData.customer,
                    jobName: aiData.jobName,
                    status: 'Poptávka',
                    dateReceived: new Date().toISOString().split('T')[0],
                    items: aiData.items.map(it => ({
                        id: Math.random().toString(36).substring(2, 11),
                        ...it,
                        size: '', colors: '', techSpecs: '', stockFormat: '', paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0
                    })),
                    position: { x: 150, y: 150 },
                    isTracked: true,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                };

                const jobRef = await db.collection('orders').add(newJob);
                targetJobId = newJob.jobId;
                console.log('✅ Vytvořena nová karta:', targetJobId);
            }

            // Uložení e-mailu
            await db.collection('zakazka_emails').add({
                zakazka_id: targetJobId,
                subject,
                entry_id,
                preview: preview || '',
                created_at: new Date().toISOString()
            });
            console.log('📎 E-mail připojen k ID:', targetJobId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, jobId: targetJobId }));
        } catch (e) {
            console.error('❌ Chyba při zpracování:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (parsedUrl.pathname === '/api/webhooks/incoming' && req.method === 'POST') {
        return handleWebhook(req, res);
    }

    // Sloužení statických souborů z dist/
    let filePath = path.join(__dirname, 'dist', parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'dist', 'index.html');
    }

    const extname = path.extname(filePath);
    const contentTypes = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg'
    };

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('Nenalezeno.');
        } else {
            res.writeHead(200, { 'Content-Type': contentTypes[extname] || 'text/plain' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CML SERVER V2.2 BĚŽÍ`);
    console.log(`------------------------------`);
    console.log(`Web:      http://localhost:${PORT}`);
    console.log(`Webhook:  http://localhost:${PORT}/api/webhooks/incoming`);
    console.log(`------------------------------\n`);
});
