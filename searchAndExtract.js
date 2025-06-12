const puppeteer = require("puppeteer");

async function searchDuckDuckGoTop10(query) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    await page.goto("https://html.duckduckgo.com/html/");
    await page.type("input[name='q']", query);
    await page.keyboard.press("Enter");

    await page.waitForSelector("a.result__a");

    const links = await page.$$eval("a.result__a", anchors =>
        anchors.map(a => a.href).filter(h => h.startsWith("http")).slice(0, 10)
    );

    await browser.close();
    return links;
}

(async () => {
    const results = await searchDuckDuckGoTop10("נעלי נייקי air max לבן מידה 42");
    console.log("🔗 קישורים שמצאתי:\n", results);
})();
