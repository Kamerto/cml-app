module.exports = async (req, res) => {
    try {
        const diagnostics = {
            FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'CHYBÍ',
            FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || 'CHYBÍ',
            FIREBASE_PRIVATE_KEY_length: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
            FIREBASE_PRIVATE_KEY_starts: process.env.FIREBASE_PRIVATE_KEY?.substring(0, 30) || 'CHYBÍ',
            FIREBASE_PRIVATE_KEY_hasNewlines: process.env.FIREBASE_PRIVATE_KEY?.includes('\n') || false,
            FIREBASE_PRIVATE_KEY_hasEscapedNewlines: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n') || false,
            nodeVersion: process.version,
            now: new Date().toISOString()
        };
        res.status(200).json(diagnostics);
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
};
