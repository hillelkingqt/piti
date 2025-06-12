const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com.json');

function loadCredentials() {
    const content = fs.readFileSync(CREDENTIALS_PATH);
    return JSON.parse(content);
}

function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
}

function makeBody(to, subject, message) {
    const emailLines = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        '',
        message,
    ];
    const email = emailLines.join('\n');
    const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return encodedEmail;
}

async function sendTestEmail() {
    console.log('📨 שולח מייל בדיקה לכתובת שלך...');
    const credentials = loadCredentials();
    const auth = authorize(credentials);
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = makeBody(
        'hillelben14@gmail.com',
        '🔥 בדיקת Gmail API',
        '<p>זה מייל בדיקה מהבוט שלך. אם אתה רואה את זה – זה <strong>עובד!</strong></p>'
    );

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw,
        },
    });

    console.log('✅ המייל נשלח בהצלחה!', res.data);
}

sendTestEmail().catch(err => {
    console.error('❌ שגיאה בשליחת המייל:', err);
});
