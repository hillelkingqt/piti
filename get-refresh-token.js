const { google } = require('googleapis');
const readline = require('readline');

// שלב 1: הגדר את הנתונים מהקובץ client_secret.json
const credentials = {
  client_id: '170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com',
  client_secret: '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',
  redirect_uris: ['http://localhost']
};

// צור את ה־OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret,
  credentials.redirect_uris[0]
);

// צור את URL ההרשאה
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://mail.google.com/']
});

console.log('\n🔗 פתח את הקישור הבא בדפדפן כדי לאשר גישה:\n');
console.log(authUrl);
console.log('\nלאחר ההרשאה, תודבק לכאן את הקוד שתקבל מהדפדפן:\n');

// שלב 2: המתן לקלט מהמשתמש
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('📥 הדבק כאן את הקוד: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    console.log('\n✅ קיבלת את הטוקנים בהצלחה:');
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);
    console.log('Expiry Date:', new Date(tokens.expiry_date).toLocaleString());

    // אופציונלי: שמור לקובץ
    const fs = require('fs');
    fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    console.log('\n💾 נשמר בהצלחה לקובץ token.json');
  } catch (err) {
    console.error('❌ שגיאה בקבלת הטוקן:', err.response?.data || err.message);
  }
});
