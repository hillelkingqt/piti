import subprocess
import time
import os
import platform

# --- הגדרות ---
# הנתיב לסקריפט ה-Node.js בתוך הפרויקט
NODE_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), 'bot.js')
NODE_EXECUTABLE = "node" # או הנתיב המלא ל-node.exe אם צריך

# --- פונקציות ---
def log_print(message):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] (Python Script): {message}")

# --- לוגיקה ראשית ---
def main():
    log_print("Python script to run Node.js bot in a new terminal.")

    if not os.path.exists(NODE_SCRIPT_PATH):
        log_print(f"ERROR: Node.js script not found at: {NODE_SCRIPT_PATH}")
        return

    # בניית הפקודה המלאה להרצת הבוט עם הדגל הרצוי
    # חשוב להקיף נתיבים עם רווחים במרכאות כפולות, במיוחד עבור Windows
    command_parts = [NODE_EXECUTABLE, f'"{NODE_SCRIPT_PATH}"', "--keep-auth"]
    full_command = " ".join(command_parts)

    log_print(f"Command to execute in new terminal: {full_command}")

    # פתיחת טרמינל חדש והרצת הפקודה
    # הלוגיקה משתנה מעט בין מערכות הפעלה
    system_platform = platform.system().lower()

    try:
        if system_platform == "windows":
            # ב-Windows, אפשר להשתמש ב 'start cmd /k' כדי להשאיר את החלון פתוח אחרי שהפקודה מסתיימת,
            # או 'start cmd /c' כדי לסגור אותו אוטומטית.
            # נשתמש ב /K כדי שתוכל לראות את הפלט.
            subprocess.Popen(f'start cmd /K "{full_command}"', shell=True)
            # הערה: ה-"" מסביב ל-full_command חשובות אם בתוך full_command יש נתיבים עם רווחים.
            # full_command כבר מכיל מרכאות סביב הנתיב של הסקריפט.
        elif system_platform == "darwin": # macOS
            # פתיחת טרמינל חדש ב-macOS
            # חשוב: זה מניח שאפליקציית Terminal.app היא ברירת המחדל.
            # יש לוודא שהפקודה בפנים לא מכילה תווים שיפריעו ל-AppleScript.
            # הדרך הפשוטה היא להריץ סקריפט קטן שמריץ את הפקודה.
            # ננסה ישירות, ואם לא עובד, נצטרך טכניקה אחרת.
            escaped_command = full_command.replace('"', '\\"') # Escape quotes for osascript
            subprocess.Popen(f'osascript -e \'tell app "Terminal" to do script "{escaped_command}"\'', shell=True)
        elif system_platform == "linux":
            # פתיחת טרמינל חדש בלינוקס (דוגמה ל-gnome-terminal, ייתכן שתצטרך להתאים לטרמינל שלך)
            # לדוגמאות נוספות: xterm -e "command", konsole -e "command", etc.
            # הדרך הבטוחה היא שהמשתמש יגדיר את פקודת הטרמינל המועדפת עליו.
            # כאן אני מניח gnome-terminal. אם הוא לא מותקן, זה ייכשל.
            #subprocess.Popen(['gnome-terminal', '--', 'bash', '-c', f"{full_command}; exec bash"])
            # דרך קצת יותר גנרית שעשויה לעבוד עם טרמינלים שונים:
            subprocess.Popen(f'x-terminal-emulator -e "bash -c \'{full_command}; read -p \\"Press Enter to close terminal...\\"\'"', shell=True)
            log_print("INFO: If using Linux and the terminal doesn't open or stay open, you might need to adjust the terminal command (e.g., use 'xterm -hold -e ...' or similar for your specific terminal emulator).")

        else:
            log_print(f"Unsupported platform: {system_platform}. Cannot open new terminal automatically.")
            return

        log_print(f"New terminal should have been opened to run the bot. This Python script will now exit.")

    except Exception as e:
        log_print(f"ERROR: Failed to open new terminal or run command: {e}")

if __name__ == "__main__":
    # זה החלק שהסקריפט מריץ כשקוראים לו ישירות
    main()