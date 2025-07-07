module.exports = {
  apps : [{
    name   : "Piti-Bot",
    script : "./bot.js", // <-- ודא שזה שם הקובץ הראשי שלך
    
    // --- החלק החשוב: הגדרות מעקב ---
    watch  : false, //  כבה לחלוטין את המעקב האוטומטי
    
    // אם בכל זאת תרצה להשתמש ב-watch בעתיד, השתמש ב-ignore_watch
    // כדי להתעלם מתיקיות וקבצים ספציפיים
    ignore_watch : [
        "node_modules",
        ".wwebjs_auth",
        "chats",
        "apk_builds",
        "*.json",
        "*.log",
        "*.png",
        "*.mp3",
        "*.webp",
        "*.pdf",
        "*.docx",
        "*.xlsx",
        "*.pptx",
        "*.tex",
        "*.aux"
    ],
    // ---------------------------------

    // הגדרות נוספות מומלצות לביצועים
    max_memory_restart: '1G', // הפעל מחדש אם הבוט צורך יותר מ-1GB RAM
    env: {
      "NODE_ENV": "production",
    }
  }]
}
