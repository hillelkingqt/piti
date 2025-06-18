import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import sys
import posixpath

RELS_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}

MAIN_NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
}


def _safe_stem(stem: str) -> str:
    return "".join(c for c in stem if c.isalnum())


def _convert_math_to_text(math_el: ET.Element) -> str:
    try:
        text = ET.tostring(math_el, encoding="unicode", method="text")
        return " ".join(text.split())
    except Exception:
        return "[Math Extraction Error]"


def _extract_image(drawing, docx_zip, rels_root, out_dir, stem, counter):
    try:
        blip = drawing.find('.//a:blip', MAIN_NS)
        if blip is None:
            return None
        embed = blip.get(f'{{{MAIN_NS["r"]}}}embed')
        if not embed or rels_root is None:
            return None
        target_rel_path = None
        for rel in rels_root.findall(f'.//rel:Relationship[@Id="{embed}"]', RELS_NS):
            target_rel_path = rel.get('Target')
            break
        if not target_rel_path:
            return None
        image_zip_path = posixpath.normpath((Path('word') / target_rel_path).as_posix())
        if image_zip_path not in docx_zip.namelist():
            if target_rel_path.startswith('/'):
                image_zip_path = target_rel_path[1:]
        if image_zip_path not in docx_zip.namelist():
            return None
        data = docx_zip.read(image_zip_path)
        suffix = Path(target_rel_path).suffix or '.png'
        safe = _safe_stem(stem)
        out_file = out_dir / f"{safe}_image_{counter}{suffix}"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, 'wb') as f:
            f.write(data)
        return str(out_file)
    except Exception as e:
        print(f"Warning extracting image: {e}", file=sys.stderr)
        return None


def extract_text(docx_path: Path, image_dir: Path, include_images: bool = True):
    parts = []
    stem = docx_path.stem
    img_counter = 1
    try:
        with zipfile.ZipFile(docx_path) as z:
            if "word/document.xml" not in z.namelist():
                return ""
            rels_root = None
            rels_path = "word/_rels/document.xml.rels"
            if rels_path in z.namelist():
                with z.open(rels_path) as f:
                    rels_root = ET.parse(f).getroot()
            with z.open("word/document.xml") as f:
                root = ET.parse(f).getroot()
                for para in root.findall('.//w:p', MAIN_NS):
                    elems = []
                    for el in para:
                        if el.tag == f"{{{MAIN_NS['w']}}}r":
                            text_run = []
                            for t in el.findall('.//w:t', MAIN_NS):
                                if t.text:
                                    text_run.append(t.text)
                            if include_images:
                                for draw in el.findall('.//wp:inline', MAIN_NS) + el.findall('.//wp:anchor', MAIN_NS):
                                    img_path = _extract_image(draw, z, rels_root, image_dir, stem, img_counter)
                                    if img_path:
                                        img_counter += 1
                                        text_run.append(f" [Image: {img_path}] ")
                            run_str = "".join(text_run)
                            if run_str:
                                elems.append(run_str)
                        elif el.tag == f"{{{MAIN_NS['m']}}}oMathPara" or el.tag == f"{{{MAIN_NS['m']}}}oMath":
                            math_el = el.find('.//m:oMath', MAIN_NS) if el.tag == f"{{{MAIN_NS['m']}}}oMathPara" else el
                            if math_el is not None:
                                elems.append(f" {_convert_math_to_text(math_el)} ")
                    para_str = " ".join("".join(elems).split())
                    if para_str:
                        parts.append(para_str)
        return "\n\n".join(parts)
    except zipfile.BadZipFile:
        print(f"Error: '{docx_path}' is not a valid zip file", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error processing '{docx_path}': {e}", file=sys.stderr)
        return None


def main():
    if len(sys.argv) < 3:
        print("Usage: python docx_extractor.py <docx_file> <output_dir> [--no-images]", file=sys.stderr)
        sys.exit(1)
    docx_file = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    include_images = True
    if len(sys.argv) > 3 and sys.argv[3] == '--no-images':
        include_images = False
    out_dir.mkdir(parents=True, exist_ok=True)
    text = extract_text(docx_file, out_dir, include_images) or ""
    sys.stdout.write(text)

if __name__ == "__main__":
    main()
