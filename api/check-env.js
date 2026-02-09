module.exports = async function handler(req, res) {
    const envCheck = {
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        details: {
            projectId: process.env.FIREBASE_PROJECT_ID || 'MISSING',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'SET (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'MISSING',
            geminiKey: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING'
        }
    };

    return res.status(200).json(envCheck);
};
