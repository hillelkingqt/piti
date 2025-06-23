const { IgApiClient } = require('instagram-private-api');
const readline = require('readline');

const ig = new IgApiClient();
const SEEN_IDS = new Set(); // למניעת תגובה כפולה

// כלי עזר לקבלת קלט מהמשתמש
const prompt = (query) =>
  new Promise((resolve) =>
    readline
      .createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      .question(query, (ans) => {
        readline.cursorTo(process.stdout, 0, 0);
        resolve(ans);
      })
  );

(async () => {
  // התחברות
  const username = await prompt('📱 Instagram username: ');
  const password = await prompt('🔒 Instagram password: ');
  ig.state.generateDevice(username);
  await ig.account.login(username, password);

  console.log('✅ Logged in! Listening for messages...');

  // לולאה אין-סופית (polling)
  while (true) {
    try {
      const inboxFeed = ig.feed.directInbox();
      const threads = await inboxFeed.items();

for (const thread of threads) {
  if (!thread.thread_id) continue; // ← מוודא שה־thread חוקי

  const threadFeed = ig.feed.directThread(thread.thread_id);
        const messages = await threadFeed.items();

        for (const message of messages) {
          if (!message.item_id || SEEN_IDS.has(message.item_id)) continue;

          SEEN_IDS.add(message.item_id);

          if (
            message.text &&
            message.text.trim().toLowerCase().includes('פיתי')
          ) {
            console.log(`📥 זוהתה הודעה עם "פיתי" מ-${message.user_id}`);
            await ig.entity.directThread([thread.thread_id]).broadcastText('מה קורה');
            console.log('📤 נשלחה תשובה: מה קורה');
          }
        }
      }
    } catch (err) {
      console.error('❌ שגיאה בלולאת הסריקה:', err.message);
    }

    await new Promise((r) => setTimeout(r, 5000)); // המתן 5 שניות
  }
})();
