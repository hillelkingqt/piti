# convert_to_pdf.py
import sys
import os
import subprocess # עדיין נשתמש בו אולי עבור Excel או כגיבוי
import platform
import shutil # לשימוש ב-shutil.which

# Force stdout/stderr to use UTF-8 encoding
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ננסה לייבא את docx2pdf, אם נכשל נחזור ל-LibreOffice כגיבוי
DOCX2PDF_ENABLED = False
if platform.system() == "Windows":
    try:
        from docx2pdf import convert as convert_docx_to_pdf_lib
        DOCX2PDF_ENABLED = True
        sys.stderr.write("Successfully imported docx2pdf.\n")
    except ImportError:
        sys.stderr.write("Warning: 'docx2pdf' module not found. Word to PDF conversion might be slower or less accurate.\n")
        sys.stderr.write("Consider installing it: pip install docx2pdf\n")
        sys.stderr.write("Falling back to LibreOffice for DOCX if available.\n")
else:
    sys.stderr.write("Info: docx2pdf is Windows-specific. Will use LibreOffice for DOCX on non-Windows systems if available.\n")


def find_libreoffice_path():
    """Tries to find the LibreOffice executable."""
    if platform.system() == "Windows":
        paths_to_check = [
            os.path.join(os.environ.get("ProgramFiles", "C:\\Program Files"), "LibreOffice", "program", "soffice.exe"),
            os.path.join(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"), "LibreOffice", "program", "soffice.exe"),
        ]
        for path in paths_to_check:
            if os.path.exists(path): return path
        return "soffice"
    elif platform.system() == "Linux":
        if shutil.which("libreoffice"): return "libreoffice"
        if shutil.which("soffice"): return "soffice"
        paths_to_check = ["/usr/bin/libreoffice", "/usr/bin/soffice", "/opt/libreoffice/program/soffice"]
        for path in paths_to_check:
            if os.path.exists(path): return path
        return "libreoffice"
    elif platform.system() == "Darwin":
        path_to_check = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
        if os.path.exists(path_to_check): return path_to_check
        return "soffice"
    return "soffice"

def convert_with_libreoffice(input_file_path, output_directory):
    """Converts using LibreOffice (fallback or for non-docx)."""
    libreoffice_executable = find_libreoffice_path()
    base_name = os.path.splitext(os.path.basename(input_file_path))[0]
    output_pdf_path = os.path.join(output_directory, f"{base_name}.pdf")
    command = [libreoffice_executable, "--headless", "--convert-to", "pdf", "--outdir", output_directory, input_file_path]
    sys.stderr.write(f"Executing LibreOffice command: {' '.join(command)}\n")
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(timeout=120)
        if process.returncode != 0:
            sys.stderr.write(f"LibreOffice conversion failed (code {process.returncode}).\n")
            if stdout: sys.stderr.write(f"LO STDOUT: {stdout.decode('utf-8', errors='replace')}\n")
            if stderr: sys.stderr.write(f"LO STDERR: {stderr.decode('utf-8', errors='replace')}\n")
            return None
        if os.path.exists(output_pdf_path):
            return output_pdf_path
        # Check input dir as fallback
        pdf_in_input_dir = os.path.join(os.path.dirname(input_file_path), f"{base_name}.pdf")
        if os.path.exists(pdf_in_input_dir):
            shutil.move(pdf_in_input_dir, output_pdf_path)
            return output_pdf_path
        sys.stderr.write(f"Error: PDF not created at '{output_pdf_path}' by LibreOffice.\n")
        return None
    except subprocess.TimeoutExpired:
        sys.stderr.write("LibreOffice conversion timed out.\n")
        if process: process.kill()
        return None
    except Exception as e:
        sys.stderr.write(f"Error during LibreOffice conversion: {str(e)}\n")
        return None

def convert_file_to_pdf(input_file_path, output_directory):
    if not os.path.exists(input_file_path):
        sys.stderr.write(f"Error: Input file not found at '{input_file_path}'\n")
        return None
    if not os.path.isdir(output_directory):
        try:
            os.makedirs(output_directory, exist_ok=True)
        except Exception as e:
            sys.stderr.write(f"Error: Could not create output directory '{output_directory}': {str(e)}\n")
            return None

    file_extension = os.path.splitext(input_file_path)[1].lower()
    base_name = os.path.splitext(os.path.basename(input_file_path))[0]
    output_pdf_path = os.path.join(output_directory, f"{base_name}.pdf")

    if file_extension == ".docx" and DOCX2PDF_ENABLED:
        sys.stderr.write(f"Attempting conversion of '{input_file_path}' to PDF using docx2pdf...\n")
        try:
            convert_docx_to_pdf_lib(input_file_path, output_pdf_path)
            if os.path.exists(output_pdf_path):
                sys.stderr.write(f"Successfully converted DOCX to PDF using docx2pdf: '{output_pdf_path}'\n")
                return output_pdf_path
            else:
                sys.stderr.write("docx2pdf conversion reported success, but output file not found. Falling back to LibreOffice if available.\n")
                return convert_with_libreoffice(input_file_path, output_directory) # Fallback
        except Exception as e:
            sys.stderr.write(f"Error using docx2pdf for '{input_file_path}': {str(e)}\n")
            sys.stderr.write("Falling back to LibreOffice if available for DOCX.\n")
            return convert_with_libreoffice(input_file_path, output_directory) # Fallback
    elif file_extension in [".doc", ".rtf", ".xlsx", ".xls", ".ods", ".pptx", ".ppt", ".odp"] or \
         (file_extension == ".docx" and not DOCX2PDF_ENABLED): # Other office formats or docx fallback
        sys.stderr.write(f"Attempting conversion of '{input_file_path}' to PDF using LibreOffice...\n")
        return convert_with_libreoffice(input_file_path, output_directory)
    else:
        sys.stderr.write(f"Error: Unsupported file type for PDF conversion: '{file_extension}'. Only common Office formats are supported with LibreOffice/docx2pdf.\n")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: python convert_to_pdf.py <input_file_path> <output_directory>\n")
        sys.exit(1)

    input_path = sys.argv[1]
    out_dir = sys.argv[2]

    pdf_file = convert_file_to_pdf(input_path, out_dir)

    if pdf_file:
        print(pdf_file)
    else:
        sys.exit(1)