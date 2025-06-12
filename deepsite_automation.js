const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const readline = require("readline");

// הפעלת Stealth Plugin
puppeteer.use(StealthPlugin());

// פונקציית עזר לקבלת קלט מהמשתמש
const askUserInput = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        })
    );
};

// פונקציית עזר להמתנה
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// הפונקציה הראשית
(async () => {
    let browser = null;

    try {
        // --- שלב 1: קלט ---
        const prompt = await askUserInput("📝 Enter your prompt for DeepSite: ");
        if (!prompt) {
            console.log("🤷 No prompt. Exiting.");
            return;
        }

        console.log("🚀 Launching browser...");
        // --- שלב 2: פתיחת דפדפן ---
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            userDataDir: "./my_huggingface_session",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certifcate-errors',
                '--ignore-certifcate-errors-spki-list',
                '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"'
            ],
            ignoreHTTPSErrors: true,
        });

        const page = (await browser.pages())[0] || await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log("💻 Navigating to DeepSite Space...");
        await page.goto("https://huggingface.co/spaces/enzostvs/deepsite", {
            waitUntil: "networkidle0", // נמתין לרשת שקטה לגמרי
            timeout: 60000
        });

        console.log("⏳ Allowing page and iframe to settle...");
        await sleep(7000); // המתנה נוספת אחרי networkidle

        // --- שלב 3: בדיקת התחברות (בדף הראשי) ---
        console.log("🔐 Checking login status on main page...");
        // (קוד בדיקת התחברות כמו קודם)
        let needsLogin = false;
        const loginLink = await page.$('a[href^="/login"]');
        if (loginLink) needsLogin = true;
        if (!needsLogin) {
            const signInButtonFound = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.some(button => button.textContent.trim().toLowerCase().includes('sign in'));
            });
            if (signInButtonFound) needsLogin = true;
        }
        if (needsLogin) {
            console.log("🔒 Please login manually in the browser, then press ENTER here.");
            await askUserInput("➡️ Press ENTER after login...");
            await page.reload({ waitUntil: "networkidle0" });
            await sleep(5000);
        } else {
            console.log("✔️ Already logged in on main page.");
        }

        // --- שלב 4: מציאת ה-iframe ועבודה בתוכו ---
        console.log("🔍 Finding the application iframe...");
        const iframeSelector = 'iframe.space-iframe'; // סלקטור ל-iframe הספציפי
        const iframeElementHandle = await page.waitForSelector(iframeSelector, { timeout: 30000 });

        if (!iframeElementHandle) {
            throw new Error("❌ Could not find the application iframe.");
        }

        const frame = await iframeElementHandle.contentFrame(); // קבלת הקונטקסט של ה-iframe
        if (!frame) {
            throw new Error("❌ Could not get the content frame of the iframe.");
        }
        console.log("✅ Successfully entered iframe context.");


        // --- שלב 5: אינטראקציה *בתוך* ה-iframe ---
        console.log("🔍 Finding the prompt input box inside the iframe...");
        // סלקטורים לשימוש בתוך ה-iframe
        const inputSelectorInFrame = 'input[placeholder="Ask AI anything..."]';

        // נחכה שהשדה יהיה זמין בתוך ה-iframe
        const inputElementInFrame = await frame.waitForSelector(inputSelectorInFrame, { visible: true, timeout: 30000 });
        if (!inputElementInFrame) {
            throw new Error("❌❌ Could not find the input box inside the iframe.");
        }

        console.log("🖱️ Clicking input box (inside iframe)...");
        await inputElementInFrame.click({ clickCount: 1 });
        await sleep(500);

        console.log("⌨️ Typing the prompt (inside iframe)...");
        await inputElementInFrame.type(prompt, { delay: 50 });

        console.log("✅ Sending prompt (inside iframe)...");
        await inputElementInFrame.press("Enter");

        // --- שלב 6: המתנה לסיום התגובה (בתוך ה-iframe) ---
        console.log("⌛ Waiting for AI response (inside iframe)...");
        const disabledInputSelectorInFrame = `${inputSelectorInFrame}[disabled]`;
        const enabledInputSelectorInFrame = `${inputSelectorInFrame}:not([disabled])`;

        try {
            await frame.waitForSelector(disabledInputSelectorInFrame, { timeout: 90000 });
            console.log("   AI is processing...");
            await frame.waitForSelector(enabledInputSelectorInFrame, { timeout: 120000 });
            console.log("✅ AI finished generating.");
        } catch (waitError) {
            console.error("⚠️ Error waiting for AI response state change inside iframe:", waitError.message);
            console.log("   Continuing to deploy step anyway.");
        }

        // --- שלב 7: לחיצה על Deploy (סביר להניח שגם בתוך ה-iframe) ---
        console.log("🔍 Finding and clicking 'Deploy to Space' button (inside iframe)...");
        // נמצא את הכפתור בתוך ה-iframe
        const deployClicked = await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            // נחפש טקסט מדויק או חלקי, נהיה גמישים
            const deployBtn = buttons.find(button =>
                button.textContent.trim().toLowerCase().includes('deploy to space')
            );
            if (deployBtn) {
                deployBtn.click();
                return true;
            }
            return false;
        });

        if (deployClicked) {
            console.log("🚀 'Deploy to Space' clicked successfully (inside iframe)!");
            console.log("   Watch the browser for the deployment result/link.");
        } else {
            console.error("❌ Could not find or click the 'Deploy to Space' button inside the iframe.");
        }

    } catch (error) {
        console.error("\n🔥🔥🔥 An error occurred during the automation:", error);
    } finally {
        // --- שלב 8: סגירה ---
        if (browser) {
            try {
                const keepOpen = await askUserInput("❓ Keep the browser open? (yes/no): ");
                if (keepOpen.toLowerCase() !== 'yes') {
                    console.log("🚪 Closing browser...");
                    await browser.close();
                } else {
                    console.log("🌐 Browser remains open. Close it manually when done.");
                }
            } catch (askError) {
                console.error("Error asking user, closing browser.", askError);
                if (browser) await browser.close(); // ודא סגירה במקרה של שגיאה בשאלה
            }
        }
    }
})();