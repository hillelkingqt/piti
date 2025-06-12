import json
import os
import time
import uuid
import tempfile
from PIL import Image, ImageDraw, ImageFont
# import gradio as gr # Removed Gradio import
import base64
import mimetypes
import sys # Import sys to read arguments
import argparse # Import argparse for better argument handling

from google import genai
from google.genai import types

def save_binary_file(file_name, data):
    """Saves binary data to a file."""
    with open(file_name, "wb") as f:
        f.write(data)

def generate(text, file_name, api_key, model="gemini-2.0-flash-exp"):    

    # Initialize client using provided api_key (or fallback to env variable)
    # Ensure API key is handled correctly if passed empty
    effective_api_key = api_key.strip() if api_key and api_key.strip() else os.environ.get("GEMINI_API_KEY")
    if not effective_api_key:
         # Print error to stderr so Node.js can catch it
        print(json.dumps({"error": "Gemini API Key is missing."}), file=sys.stderr)
        sys.exit(1) # Exit with error code

    try:
        client = genai.Client(api_key=effective_api_key)

        # Ensure file exists before uploading
        if not os.path.exists(file_name):
            print(json.dumps({"error": f"Input file not found: {file_name}"}), file=sys.stderr)
            sys.exit(1)

        files = [ client.files.upload(file=file_name) ]

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(
                        file_uri=files[0].uri,
                        mime_type=files[0].mime_type,
                    ),
                    types.Part.from_text(text=text),
                ],
            ),
        ]
        generate_content_config = types.GenerateContentConfig(
            # Consider adjusting parameters if needed for image editing
            temperature=0.4, # Maybe lower temp for more predictable edits?
            # top_p=0.95,
            # top_k=40,
            # max_output_tokens=8192, # Often not needed for image output
            response_modalities=["image"], # Request only image modality
            response_mime_type="image/png", # Request PNG directly
        )

        text_response = ""
        image_path = None

        # Create a *new* temporary file for the *output* image
        # Use delete=False so Node.js can read it before it's deleted
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as output_tmp:
            output_image_path = output_tmp.name

        print(f"Debug: Attempting to generate image. Prompt: '{text}'. Input file: {file_name}. Output placeholder: {output_image_path}", file=sys.stderr)

        # --- Simplified response handling for image modality ---
        response = client.models.generate_content( # Use generate_content directly
            model=model, # Use the specified model
            contents=contents,
            generation_config=generate_content_config,
            # stream=False # Don't stream if expecting a single image
        )

        # Check if the response has the expected image data
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
             part = response.candidates[0].content.parts[0]
             if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                  save_binary_file(output_image_path, part.inline_data.data)
                  image_path = output_image_path # Set the path to the *saved output*
                  print(f"Debug: Image generated and saved to {image_path}", file=sys.stderr)
             elif part.text: # Handle case where text is returned instead
                  text_response = part.text
                  print(f"Debug: Received text response instead of image: {text_response}", file=sys.stderr)
             else:
                  print("Debug: No image or text found in the primary part.", file=sys.stderr)
        else:
             # Attempt to extract text if available, even without candidates structure
             try:
                 text_response = response.text
                 print(f"Debug: No candidates, but found text response: {text_response}", file=sys.stderr)
             except AttributeError:
                 print("Debug: No candidates and no text attribute found in response.", file=sys.stderr)
                 text_response = "Model did not return expected image or text."


        # Clean up the uploaded file on Gemini side (optional but good practice)
        try:
            for f in files:
                client.files.delete(name=f.name)
        except Exception as e:
             print(f"Debug: Error deleting uploaded file {f.name}: {e}", file=sys.stderr)


        # Return the path to the *saved edited image* and any text response
        return image_path, text_response

    except Exception as e:
         # Print error details to stderr
        print(json.dumps({"error": f"Error during Gemini generation: {e}"}), file=sys.stderr)
        # Return None for image_path and the error message as text response
        return None, f"Error during Gemini generation: {e}"

# --- Main execution block ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Edit image using Gemini API.')
    parser.add_argument('image_path', type=str, help='Path to the input image file.')
    parser.add_argument('prompt', type=str, help='Editing prompt.')
    parser.add_argument('api_key', type=str, help='Gemini API Key (can be empty if set as environment variable).')
    parser.add_argument('--model', type=str, default='gemini-1.5-flash-latest', help='Gemini model to use (e.g., gemini-1.5-flash-latest).') # Changed default

    args = parser.parse_args()

    # Call the generate function
    edited_image_path, text_resp = generate(
        text=args.prompt,
        file_name=args.image_path,
        api_key=args.api_key,
        model=args.model # Pass the model name
    )

    # Prepare result dictionary
    result = {
        "image_path": edited_image_path, # Path to the *edited* image (or None)
        "text_response": text_resp
    }

    # Print the result as JSON to stdout
    print(json.dumps(result))

    # Clean up the original input image file passed as argument?
    # NO - Node.js should handle the lifecycle of the temp file it creates.
    # Python only needs to handle the lifecycle of the *output* temp file if needed,
    # but since we pass the path back to Node.js, Node.js should delete it after use.