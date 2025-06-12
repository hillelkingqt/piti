import sys
import os
import json
import re 
from pathlib import Path
from xhtml2pdf import pisa
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# --- START: Force UTF-8 for stdout ---
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')
# --- END: Force UTF-8 for stdout ---

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.stderr.write("Error: BeautifulSoup4 library is not installed. Please install it using: pip install beautifulsoup4\n")
    sys.exit(1)

# משתנה גלובלי שיקבע על ידי ה-JSON מהסקריפט הראשי
PROJECT_FONT_DIR_FROM_JSON = None

def link_callback(uri, rel):
    global PROJECT_FONT_DIR_FROM_JSON

    # Try to resolve fonts based on PROJECT_FONT_DIR_FROM_JSON first
    if uri.startswith("fonts/") and PROJECT_FONT_DIR_FROM_JSON:
        base_font_dir = Path(PROJECT_FONT_DIR_FROM_JSON)
        # Make sure to correctly join the path parts
        font_filename = uri.split("fonts/", 1)[-1] # Get the part after "fonts/"
        font_file_path = base_font_dir / font_filename
        if font_file_path.exists():
            return str(font_file_path.resolve())
        else:
            sys.stderr.write(f"Warning (link_callback): Font URI '{uri}' resolved to non-existent path '{font_file_path}' using PROJECT_FONT_DIR.\n")

    # Fallback or general local file handling if not a "fonts/" URI or PROJECT_FONT_DIR_FROM_JSON is not set
    # This part tries to resolve URIs relative to the HTML file's location or as absolute paths.
    try:
        # If 'rel' (base path of the HTML file) is provided and URI is relative
        if rel:
            # Create a Path object from rel; if it's a filename, get its parent directory
            base_path = Path(rel)
            if base_path.is_file():
                base_path = base_path.parent
            
            potential_path = (base_path / uri).resolve()
            if potential_path.exists() and potential_path.is_file():
                return str(potential_path)
            else:
                sys.stderr.write(f"Warning (link_callback): Relative URI '{uri}' from base '{rel}' resolved to non-existent path '{potential_path}'.\n")

        # If URI is an absolute path that exists
        abs_uri_path = Path(uri)
        if abs_uri_path.is_absolute() and abs_uri_path.exists() and abs_uri_path.is_file():
            return str(abs_uri_path)

    except Exception as e:
        sys.stderr.write(f"Warning (link_callback): Error resolving URI '{uri}' with rel '{rel}': {e}\n")
    
    # If all else fails, return the original URI
    # sys.stderr.write(f"Warning (link_callback): Could not resolve URI '{uri}', returning as is.\n")
    return uri

def clean_html_for_pdf(html_string: str) -> str:
    """
    Cleans HTML content to improve compatibility with xhtml2pdf.
    - Removes problematic external CSS links (e.g., KaTeX).
    - Removes all <script> tags.
    - Removes CSS @keyframes and 'animation' properties from <style> tags.
    """
    soup = BeautifulSoup(html_string, "html.parser")

    # 1. Remove KaTeX CSS links (and potentially other problematic external CSS)
    removed_css_links = []
    for link_tag in soup.find_all("link", rel="stylesheet", href=True):
        href = link_tag.get("href", "").lower()
        # Add more problematic CSS patterns here if needed
        if "katex.min.css" in href or "some_other_problematic.css" in href:
            removed_css_links.append(href)
            link_tag.decompose()
    if removed_css_links:
        sys.stderr.write(f"Removed external CSS links: {', '.join(removed_css_links)}\n")

    # 2. Remove all script tags
    script_tags_found = len(soup.find_all("script"))
    if script_tags_found > 0:
        for script_tag in soup.find_all("script"):
            script_tag.decompose()
        sys.stderr.write(f"Removed {script_tags_found} <script> tags.\n")

    # 3. Remove @keyframes and animation CSS rules from <style> tags
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            original_css = style_tag.string
            # Remove @keyframes blocks
            modified_css = re.sub(r"@keyframes\s+\w+\s*\{[\s\S]*?\}", 
                                  "/* @keyframes rule removed by pdf generator */", 
                                  original_css, flags=re.IGNORECASE | re.MULTILINE)
            # Remove 'animation:' properties and 'animation-name:' etc.
            # This regex looks for 'animation' followed by any non-colon char zero or more times,
            # then ':', then anything until a ';' or '}'
            modified_css = re.sub(r"animation(?:-[\w-]+)?\s*:[^;}]*(?:;|(?=}))", 
                                  "/* animation property removed by pdf generator */", 
                                  modified_css, flags=re.IGNORECASE)
            
            if original_css != modified_css:
                style_tag.string = modified_css
                sys.stderr.write("Processed <style> tag to remove CSS animations.\n")
    
    cleaned_html = str(soup)
    # You can write the cleaned HTML to a temp file for debugging if needed:
    # with open("debug_cleaned_html_for_pdf.html", "w", encoding="utf-8") as f:
    #     f.write(cleaned_html)
    # sys.stderr.write("Debug: Cleaned HTML written to debug_cleaned_html_for_pdf.html\n")
    return cleaned_html

def convert_html_to_pdf(html_path: str, pdf_path: str, project_font_dir: str) -> str | None:
    global PROJECT_FONT_DIR_FROM_JSON
    PROJECT_FONT_DIR_FROM_JSON = project_font_dir # Set for link_callback

    font_dir_path = Path(project_font_dir).resolve() # Ensure absolute path
    reg_font_path = font_dir_path / "NotoSansHebrew-Regular.ttf"
    bold_font_path = font_dir_path / "NotoSansHebrew-Bold.ttf"

    if not reg_font_path.exists():
        sys.stderr.write(f"Error: Missing font file: {reg_font_path}\n")
        return None
    # It's okay if bold font is missing, will fall back or not use bold.
    # if not bold_font_path.exists():
    #     sys.stderr.write(f"Warning: Missing bold font file: {bold_font_path}. Bold text may not render correctly.\n")

    try:
        # Register fonts if not already registered
        # Checking by name is a bit fragile; direct registration should be idempotent
        # or ReportLab handles re-registration gracefully.
        pdfmetrics.registerFont(TTFont("NotoSansHebrew", str(reg_font_path)))
        if bold_font_path.exists():
            pdfmetrics.registerFont(TTFont("NotoSansHebrew-Bold", str(bold_font_path)))
        
        # Font family registration
        font_family_args = {"normal": "NotoSansHebrew"}
        if bold_font_path.exists():
            font_family_args["bold"] = "NotoSansHebrew-Bold"
        
        registerFontFamily("NotoSansHebrew", **font_family_args)
        sys.stderr.write(f"Registered font family 'NotoSansHebrew' with normal='NotoSansHebrew'{', bold=NotoSansHebrew-Bold' if bold_font_path.exists() else ''}.\n")

    except Exception as font_reg_error:
        sys.stderr.write(f"Error during font registration: {font_reg_error}\n")
        return None # Cannot proceed without fonts

    try:
        with open(html_path, "r", encoding="utf-8") as src_file:
            html_content_original = src_file.read()
        
        sys.stderr.write("Cleaning HTML content for PDF generation...\n")
        html_content_cleaned = clean_html_for_pdf(html_content_original)
        
        with open(pdf_path, "wb") as result_file:
            # Pass the HTML file's directory as the base for relative paths in link_callback
            html_file_dir = str(Path(html_path).parent.resolve())

            pisa_status = pisa.CreatePDF(
                html_content_cleaned,
                dest=result_file,
                encoding="utf-8",
                link_callback=lambda uri, rel: link_callback(uri, html_file_dir) # Pass html_file_dir as rel
            )

        if pisa_status.err:
            sys.stderr.write(f"PISA errors occurred during PDF creation (Code: {pisa_status.err}).\n")
            # Attempt to print more detailed log messages from PISA
            if hasattr(pisa_status, 'log') and pisa_status.log:
                for msg_type, detail, location in pisa_status.log:
                    sys.stderr.write(f"  PISA Log: Type={msg_type}, Detail='{detail}', Location='{location}'\n")
            elif hasattr(pisa_status, 'errorMessage') and pisa_status.errorMessage:
                 sys.stderr.write(f"  PISA ErrorMessage: {pisa_status.errorMessage}\n")
            return None
        
        sys.stderr.write(f"PDF successfully created at: {pdf_path}\n")
        return pdf_path

    except Exception as e:
        sys.stderr.write(f"An unexpected error occurred in convert_html_to_pdf: {e}\n")
        import traceback
        sys.stderr.write(traceback.format_exc() + "\n")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python generate_pdf_from_html.py <input_json_path>\n")
        sys.exit(1)

    input_json_path_arg = sys.argv[1]
    if not Path(input_json_path_arg).exists():
        sys.stderr.write(f"Error: Input JSON file not found: {input_json_path_arg}\n")
        sys.exit(1)

    try:
        with open(input_json_path_arg, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Error: Could not decode JSON from file {input_json_path_arg}: {e}\n")
        sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"Error: Could not read JSON file {input_json_path_arg}: {e}\n")
        sys.exit(1)


    html_file_path_str = data.get("html_file_path")
    output_pdf_path_str = data.get("output_pdf_path")
    project_font_dir_str = data.get("project_font_dir")

    if not html_file_path_str or not output_pdf_path_str:
        sys.stderr.write("Error: JSON must contain 'html_file_path' and 'output_pdf_path'.\n")
        sys.exit(1)
    
    if not project_font_dir_str:
        sys.stderr.write("Error: JSON must contain 'project_font_dir'.\n")
        sys.exit(1)
    
    if not Path(project_font_dir_str).is_dir():
        sys.stderr.write(f"Error: Project font directory '{project_font_dir_str}' specified in JSON does not exist or is not a directory.\n")
        sys.exit(1)
    if not Path(html_file_path_str).is_file():
        sys.stderr.write(f"Error: HTML input file '{html_file_path_str}' specified in JSON does not exist or is not a file.\n")
        sys.exit(1)

    # Ensure output_pdf_path directory exists
    try:
        Path(output_pdf_path_str).parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        sys.stderr.write(f"Error: Could not create directory for output PDF '{output_pdf_path_str}': {e}\n")
        sys.exit(1)

    generated_pdf_path = convert_html_to_pdf(html_file_path_str, output_pdf_path_str, project_font_dir_str)

    if generated_pdf_path:
        # Print the path of the generated PDF to stdout for Node.js to capture
        print(generated_pdf_path) 
        sys.exit(0)
    else:
        sys.stderr.write("PDF generation failed.\n")
        sys.exit(1)