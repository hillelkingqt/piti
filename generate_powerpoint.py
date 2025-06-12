# --- START OF FILE generate_powerpoint.py ---
import win32com.client
import json
import sys
import os
import io

# מילון למיפוי שמות פריסות ידידותיים לערכים המספריים של PowerPoint
PP_LAYOUTS = {
    "custom": 0,
    "title_slide": 1,
    "title_and_content": 2,
    "section_header": 3,
    "two_content": 4,
    "comparison": 5,
    "title_only": 6,
    "blank": 12,
    "content_with_caption": 13,
    "picture_with_caption": 14,
}

PP_ANIMATION_EFFECTS = {
    "none": 0,
    "appear": 257,
    "fly_in": 769,
    "fade": 513,
    "zoom": 1025,
    "wipe": 2049,
    "split": 1793,
    "fly_from_bottom": 771,
    "fly_from_left": 770,
    "fly_from_right": 773,
    "fly_from_top": 772,
}

PP_TRANSITION_EFFECTS = {
    "none": 0,
    "fade": 513,
    "cut": 258,
    "cover_down": 1284,
    "push_down": 772,
}

PP_TRANSITION_SPEEDS = {
    "slow": 1,
    "medium": 2,
    "fast": 3,
}

PP_TEXT_ALIGNMENT = {
    "left": 1,
    "center": 2,
    "right": 3,
    "justify": 4,
    "distribute": 5
}

# --- הוספה: קבועים עבור כיווניות טקסט ---
PP_TEXT_DIRECTION = {
    "ltr": 1, # ppDirectionLeftToRight
    "rtl": 2  # ppDirectionRightToLeft
}

# --- הוספה: קבועים עבור שפות (לצורך הגדרת שפת הטקסט) ---
MSO_LANGUAGE_ID = {
    "hebrew": 1037,
    "english_us": 1033,
    # אפשר להוסיף עוד שפות לפי הצורך
}


def parse_rgb_color(rgb_string):
    if isinstance(rgb_string, int):
        return rgb_string
    if rgb_string and rgb_string.startswith("RGB(") and rgb_string.endswith(")"):
        try:
            r, g, b = map(int, rgb_string[4:-1].split(','))
            return b * 65536 + g * 256 + r
        except ValueError:
            print(f"Warning: Could not parse RGB color string: {rgb_string}")
            return 0
    return 0

def apply_text_formatting(text_range_obj, formatting_data): # שיניתי את שם הפרמטר ל-text_range_obj
    if "text" in formatting_data:
        text_range_obj.Text = formatting_data["text"]
    if "fontName" in formatting_data:
        text_range_obj.Font.Name = formatting_data["fontName"]
    if "fontSize" in formatting_data:
        text_range_obj.Font.Size = formatting_data["fontSize"]
    if "fontColor" in formatting_data:
        text_range_obj.Font.Color.RGB = parse_rgb_color(formatting_data["fontColor"])
    if formatting_data.get("bold", False):
        text_range_obj.Font.Bold = True
    if formatting_data.get("italic", False):
        text_range_obj.Font.Italic = True
    if formatting_data.get("underline", False):
        text_range_obj.Font.Underline = True

    # --- שינוי: טיפול בכיווניות ויישור טקסט ---
    paragraph_format = text_range_obj.ParagraphFormat # גישה לאובייקט עיצוב הפסקה

    if "alignment" in formatting_data:
        alignment_val = PP_TEXT_ALIGNMENT.get(formatting_data["alignment"].lower(), PP_TEXT_ALIGNMENT["left"]) # ברירת מחדל לשמאל
        paragraph_format.Alignment = alignment_val

    # הגדרת כיווניות הטקסט ושפת הטקסט
    if "direction" in formatting_data:
        direction_val = PP_TEXT_DIRECTION.get(formatting_data["direction"].lower())
        if direction_val:
            # חשוב: קודם להגדיר את כיווניות הפסקה
            paragraph_format.TextDirection = direction_val
            # ואז להגדיר את שפת הטקסט (עוזר לכיווניות תווים כמו סוגריים, פיסוק)
            if formatting_data["direction"].lower() == "rtl":
                text_range_obj.LanguageID = MSO_LANGUAGE_ID.get("hebrew", 1037)
                 # עבור טקסט בעברית, לרוב נרצה שהיישור יהיה לימין כברירת מחדל אם לא צוין אחרת
                if "alignment" not in formatting_data:
                     paragraph_format.Alignment = PP_TEXT_ALIGNMENT["right"]
            else: # ltr
                text_range_obj.LanguageID = MSO_LANGUAGE_ID.get("english_us", 1033)
                if "alignment" not in formatting_data:
                     paragraph_format.Alignment = PP_TEXT_ALIGNMENT["left"]

def add_shape_to_slide(slide_obj, shape_data, ppt_app_instance):
    shape_type = shape_data.get("type", "textbox").lower()
    pos = shape_data.get("position", {})
    left = pos.get("left", 50)
    top = pos.get("top", 50)
    width = pos.get("width", 300)
    height = pos.get("height", 100)

    new_shape = None

    if shape_type == "textbox":
        # Orientation 1 is msoTextOrientationHorizontal
        new_shape = slide_obj.Shapes.AddTextbox(Orientation=1, Left=left, Top=top, Width=width, Height=height)
        if "content" in shape_data:
            # TextFrame2 מספק שליטה טובה יותר על כיווניות ועיצוב טקסט מתקדם
            # אך נשאר עם TextFrame לעת עתה לפשטות, TextDirection בפסקה אמור להספיק.
            apply_text_formatting(new_shape.TextFrame.TextRange, shape_data["content"])
            # --- הוספה: הגדרת כיווניות ברירת מחדל של TextFrame אם לא צוין אחרת בתכני הטקסט ---
            # זה יכול לעזור עם ברירת המחדל החזותית של התיבה כולה
            if shape_data.get("content", {}).get("direction", "").lower() == "rtl":
                if hasattr(new_shape.TextFrame, 'ReadingOrder'):
                     new_shape.TextFrame.ReadingOrder = 2 # xlRTOL
            elif hasattr(new_shape.TextFrame, 'ReadingOrder'): # ברירת מחדל LTR
                 new_shape.TextFrame.ReadingOrder = 1 # xlLTOR


    elif shape_type == "image":
        image_path = shape_data.get("image_path")
        if image_path and os.path.exists(image_path):
            new_shape = slide_obj.Shapes.AddPicture(FileName=image_path, LinkToFile=False, SaveWithDocument=True, Left=left, Top=top, Width=width, Height=height)
        else:
            print(f"Warning: Image path not found or not provided: {image_path}")
            new_shape = slide_obj.Shapes.AddTextbox(Orientation=1, Left=left, Top=top, Width=width, Height=height)
            new_shape.TextFrame.TextRange.Text = f"Image not found:\n{image_path or 'Path not specified'}"

    if new_shape and "animation" in shape_data:
        anim_data = shape_data["animation"]
        apply_animation(new_shape, anim_data)

    return new_shape

def apply_animation(shape_obj, anim_data):
    if not anim_data or not hasattr(shape_obj, "AnimationSettings"):
        return

    animation_settings = shape_obj.AnimationSettings
    effect_name = anim_data.get("entryEffect", "none").lower()
    effect_val = PP_ANIMATION_EFFECTS.get(effect_name, PP_ANIMATION_EFFECTS["none"])

    if effect_val != PP_ANIMATION_EFFECTS["none"]:
        animation_settings.EntryEffect = effect_val
        animation_settings.Animate = True

        if "afterPrevious" in anim_data:
             animation_settings.AdvanceMode = 2 if anim_data["afterPrevious"] else 1
        if "delay" in anim_data:
            animation_settings.AdvanceTime = float(anim_data["delay"])

        if effect_name == "fly_in" and "from" in anim_data:
            fly_from_direction = anim_data["from"].lower()
            direction_map = {
                "left": PP_ANIMATION_EFFECTS["fly_from_left"],
                "right": PP_ANIMATION_EFFECTS["fly_from_right"],
                "top": PP_ANIMATION_EFFECTS["fly_from_top"],
                "bottom": PP_ANIMATION_EFFECTS["fly_from_bottom"]
            }
            if fly_from_direction in direction_map:
                # TextLevelEffect הוא לעיתים MsoAnimEffect ולא ppEffect, צריך לבדוק את הקבועים הנכונים.
                # נראה ש-EntryEffect מכסה את זה לרוב.
                # אם רוצים אנימציה של טקסט לפי פסקאות/אותיות, צריך להשתמש ב-
                # animation_settings.TextUnitEffect = ppAnimateByParagraph (או Word, Letter)
                # animation_settings.AnimateTextInReverse
                pass # כרגע EntryEffect מטפל בזה מספיק טוב ל-fly_in

def apply_slide_background(slide_obj, bg_data, ppt_app_instance):
    if "color" in bg_data:
        slide_obj.FollowMasterBackground = False
        slide_obj.Background.Fill.ForeColor.RGB = parse_rgb_color(bg_data["color"])
        slide_obj.Background.Fill.Visible = True
    elif "image_path" in bg_data:
        image_path = bg_data["image_path"]
        if image_path and os.path.exists(image_path):
            slide_obj.FollowMasterBackground = False
            slide_obj.Background.Fill.UserPicture(image_path)
            slide_obj.Background.Fill.Visible = True
        else:
            print(f"Warning: Background image path not found: {image_path}")

def apply_slide_transition(slide_obj, trans_data):
    transition = slide_obj.SlideShowTransition
    effect_name = trans_data.get("effect", "none").lower()
    effect_val = PP_TRANSITION_EFFECTS.get(effect_name, PP_TRANSITION_EFFECTS["none"])

    if effect_val != PP_TRANSITION_EFFECTS["none"]:
        transition.EntryEffect = effect_val

    speed_name = trans_data.get("speed", "medium").lower()
    transition.Speed = PP_TRANSITION_SPEEDS.get(speed_name, PP_TRANSITION_SPEEDS["medium"])

    if "advanceOnClick" in trans_data:
        transition.AdvanceOnClick = trans_data["advanceOnClick"]
    if "advanceAfterTime" in trans_data:
        transition.AdvanceOnTime = True
        transition.AdvanceTime = float(trans_data["advanceAfterTime"])

def create_powerpoint_from_json(json_file_path):
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading or parsing JSON file: {e}", file=sys.stderr)
        return None

    ppt = None
    presentation = None
    try:
        ppt = win32com.client.Dispatch("PowerPoint.Application")
        ppt.Visible = True # הוחזר ל-True למניעת שגיאות
    except Exception as e:
        print(f"Error dispatching PowerPoint application: {e}", file=sys.stderr)
        return None

    try:
        presentation = ppt.Presentations.Add()

        if "default_theme_path" in data and data["default_theme_path"]:
            theme_path = data["default_theme_path"]
            if os.path.exists(theme_path):
                try:
                    presentation.ApplyTheme(theme_path)
                except Exception as e:
                    print(f"Warning: Could not apply theme '{theme_path}': {e}")
            else:
                print(f"Warning: Theme file not found: {theme_path}")

        for slide_data in data.get("slides", []):
            layout_name = slide_data.get("layout", "blank").lower()
            layout_val = PP_LAYOUTS.get(layout_name, PP_LAYOUTS["blank"])
            slide = None # Initialize slide to None

            try:
                current_slide_count = presentation.Slides.Count
                slide = presentation.Slides.Add(current_slide_count + 1, layout_val)
            except Exception as e:
                print(f"Error adding slide with layout {layout_name} ({layout_val}): {e}", file=sys.stderr)
                try:
                    current_slide_count = presentation.Slides.Count
                    slide = presentation.Slides.Add(current_slide_count + 1, PP_LAYOUTS["blank"])
                    print("Added a blank slide as fallback.")
                except Exception as fallback_e:
                    print(f"Failed to add even a blank slide: {fallback_e}", file=sys.stderr)
                    continue

            if "background" in slide_data:
                apply_slide_background(slide, slide_data["background"], ppt)

            if "transition" in slide_data:
                apply_slide_transition(slide, slide_data["transition"])

            placeholders_filled_by_type = set()

            # לולאה זו מנסה למלא placeholders קודם
            if layout_name in ["title_slide", "title_only", "title_and_content", "section_header", "content_with_caption", "picture_with_caption"]:
                for shape_data_item in slide_data.get("shapes", []):
                    shape_type_from_json = shape_data_item.get("type", "").lower()
                    content_data = shape_data_item.get("content", {})
                    target_placeholder = None

                    if shape_type_from_json == "title" and 1 not in placeholders_filled_by_type:
                        try:
                            if slide.Shapes.HasTitle: # Check if a title placeholder exists
                                target_placeholder = slide.Shapes.Title
                                placeholders_filled_by_type.add(1)
                        except Exception as title_ex:
                            print(f"Note: Could not access slide.Shapes.Title for layout {layout_name}. Error: {title_ex}")
                            # Try accessing by index if specific common placeholders are known for this layout
                            if layout_name == "title_slide" or layout_name == "title_only":
                                try: target_placeholder = slide.Shapes.Placeholders(1) ; placeholders_filled_by_type.add(1)
                                except Exception: pass
                            elif layout_name == "title_and_content" or layout_name == "section_header":
                                try: target_placeholder = slide.Shapes.Placeholders(1) ; placeholders_filled_by_type.add(1)
                                except Exception: pass


                    elif shape_type_from_json == "subtitle" and layout_name == "title_slide" and 2 not in placeholders_filled_by_type:
                         try: target_placeholder = slide.Shapes.Placeholders(2) ; placeholders_filled_by_type.add(2)
                         except Exception: pass
                    elif shape_type_from_json == "body" and layout_name == "title_and_content" and 2 not in placeholders_filled_by_type:
                         try: target_placeholder = slide.Shapes.Placeholders(2) ; placeholders_filled_by_type.add(2)
                         except Exception: pass
                    # ... other placeholder types ...

                    if target_placeholder:
                        try:
                            apply_text_formatting(target_placeholder.TextFrame.TextRange, content_data)
                            if "animation" in shape_data_item:
                                apply_animation(target_placeholder, shape_data_item["animation"])
                            shape_data_item["_handled_as_placeholder"] = True # סמן שטופל
                        except Exception as e:
                            print(f"Warning: Could not set text for placeholder type '{shape_type_from_json}': {e}")
                            # Don't add as manual shape here, let the next loop handle unhandled shapes
                    # else:
                         # אם זה לא placeholder מוכר, אל תעשה כלום בלולאה הזו, הלולאה הבאה תטפל בזה
                         # print(f"Debug: Shape type '{shape_type_from_json}' not processed as known placeholder in this pass for layout '{layout_name}'.")

            # לולאה זו מוסיפה צורות שלא טופלו כ-placeholders, או כל הצורות אם הפריסה היא blank
            for shape_data_item in slide_data.get("shapes", []):
                if not shape_data_item.get("_handled_as_placeholder", False):
                    add_shape_to_slide(slide, shape_data_item, ppt)


        output_folder = data.get("output_folder", os.getcwd())
        output_filename_base = data.get("output_filename", "presentation")
        # ודא שאין תווים לא חוקיים בשם הקובץ
        safe_filename_base = "".join(c if c.isalnum() or c in [' ', '_', '-'] else '_' for c in output_filename_base).rstrip()
        output_pptx_path = os.path.join(output_folder, f"{safe_filename_base}.pptx")


        os.makedirs(output_folder, exist_ok=True)
        presentation.SaveAs(output_pptx_path)
        # presentation.Close() # שקול להשאיר פתוח אם יש צורך בפעולות נוספות או בדיבגר
        # ppt.Quit() # אותו כנ"ל
        return output_pptx_path

    except Exception as e:
        print(f"An error occurred during PowerPoint generation: {e}", file=sys.stderr)
        try:
            if presentation:
                presentation.Close()
        except: pass
        # try:
        #     if ppt: # אל תסגור את האפליקציה הראשית אם היא עדיין בשימוש
        #         pass # ppt.Quit()
        # except: pass
        return None
    finally:
        # סגירה "נקייה" יותר היא בדרך כלל לא הכרחית כאן אם הסקריפט מסיים
        # אם משאירים את PowerPoint פתוח בכוונה (Visible=True), אז לא צריך לסגור.
        pass


sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_powerpoint.py <path_to_json_file>", file=sys.stderr)
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"Error: JSON file not found at {json_path}", file=sys.stderr)
        sys.exit(1)

    generated_file = create_powerpoint_from_json(json_path)
    if generated_file:
        print(generated_file)
    else:
        sys.exit(1)
# --- END OF FILE generate_powerpoint.py ---