// JavaScript source code
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const path = require('path');

// הרשאה מלאה לכל Gmail
const SCOPES = ['https://mail.google.com/'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com.json');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});
console.log('🔑 פתח את הקישור הבא כדי לאשר גישה:');
console.log(authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
rl.question('📋 הדבק כאן את הקוד שהעתקת מהדפדפן: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('❌ שגיאה בקבלת הטוקן', err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('✅ טוקן חדש נשמר בהצלחה ל-token.json!');
    });
});
