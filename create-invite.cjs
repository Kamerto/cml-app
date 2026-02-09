const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.vercel', '.env.development.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)="(.+)"/);
    if (match) env[match[1]] = match[2];
});

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
});

const db = admin.firestore();
db.collection('invites').doc('CML-2026').set({
    created_at: admin.firestore.FieldValue.serverTimestamp()
}).then(() => {
    console.log('Invite code CML-2026 created successfully');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
