const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Read the Vercel generated env file
const envPath = path.join(__dirname, '.vercel', '.env.development.local');
if (!fs.existsSync(envPath)) {
    console.error('Environment file not found');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    // Basic parser for KEY="VALUE"
    const match = line.match(/^([^=]+)="(.+)"/);
    if (match) {
        env[match[1]] = match[2];
    }
});

if (!env.FIREBASE_PROJECT_ID) {
    console.error('FIREBASE_PROJECT_ID not found in env file');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
});

admin.auth().listUsers(10)
    .then(result => {
        if (result.users.length === 0) {
            console.log('No users found.');
        } else {
            result.users.forEach(user => {
                console.log(`USER_EMAIL: ${user.email}`);
            });
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
