const path = require('path');

// Bot Owner/Admin
const MY_ID = "972532752474@c.us";

// Paths
const BASE_CHAT_DIR = "C:\\Users\\hillel1\\Desktop\\WHAT\\chats"; // Note: escaped backslashes for Windows paths in JS strings
const PENDING_ACTIONS_PATH = path.join(__dirname, 'pending_actions.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com.json');
const STOPPED_CHATS_PATH = path.join(__dirname, 'stoppedChats.json');
const TTS_OUTPUT_PATH = path.join(__dirname, 'tts_output.mp3'); // from generateTTS
const BARCODE_OUTPUT_PATH_PREFIX = path.join(__dirname, 'barcode_'); // from handleGenerateBarcodeAction, assuming temp files in root

// External Services API Keys & Config
const CLOUDFLARE_ACCOUNT_ID = "38a8437a72c997b85a542a6b64a699e2";
const CLOUDFLARE_API_TOKEN = "jCnlim7diZ_oSCKIkSUxRJGRS972sHEHfgGTmDWK";
const PIXABAY_API_KEY = '50212858-c6a0623d5989990f7c6f1dc00';
const GEMINI_API_KEY_DEFAULT = "AIzaSyDfqo_60y39EG_ZW5Fn3EeB6BoZMru5V_k"; // Default/fallback, apiKeyManager should be primary
const ELEVENLABS_API_KEY = 'sk_50eae250d2c4cfee9e281950f42aa87fd91ec1bcb382ad90';

// Cloudflare Endpoints
const BASE_IMAGE_GENERATION_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/`;
const CLOUDFLARE_VISION_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/unum/uform-gen2-qwen-500m`;
const CLOUDFLARE_WHISPER_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper-large-v3-turbo`;

const IMAGE_MODEL_ENDPOINTS = {
    'stable-diffusion-xl-lighting': '@cf/bytedance/stable-diffusion-xl-lightning',
    'stable-diffusion-xl-base-1.0': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    'dreamshaper-8-lcm': '@cf/lykon/dreamshaper-8-lcm',
    'flux-1-schnell': '@cf/black-forest-labs/flux-1-schnell'
};

// Gradio Spaces URLs
const COGVIDEO_GRADIO_SPACE = "THUDM/CogVideoX-5B-Space";
const GEMINI_IMAGE_EDIT_GRADIO_SPACE = "ameerazam08/Gemini-Image-Edit"; // Was GRADIO_SPACE_URL
const LTX_VIDEO_GRADIO_SPACE = "Lightricks/ltx-video-distilled";
const ACE_STEP_MUSIC_GRADIO_SPACE = "ACE-Step/ACE-Step";

// Client Configuration
const PUPPETEER_EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // Note: escaped backslashes
const WEB_VERSION_CACHE_REMOTE_PATH = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html';
const AUTH_DIR = './.wwebjs_auth';

// Bot Behavior & Limits
const MAX_LATEX_ERRORS_TO_KEEP = 5;

// APK Generation (Experimental)
const GRADLE_VERSION = '8.12.1';
const APK_BUILD_BASE_DIR = path.join(__dirname, 'apk_builds');
const ANDROID_SDK_PATH = 'C:\\Users\\hillel1\\Desktop\\Android\\Sdk'; // Note: escaped backslashes

module.exports = {
    MY_ID,
    BASE_CHAT_DIR,
    PENDING_ACTIONS_PATH,
    TOKEN_PATH,
    CREDENTIALS_PATH,
    STOPPED_CHATS_PATH,
    TTS_OUTPUT_PATH,
    BARCODE_OUTPUT_PATH_PREFIX,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN,
    PIXABAY_API_KEY,
    GEMINI_API_KEY_DEFAULT,
    ELEVENLABS_API_KEY,
    BASE_IMAGE_GENERATION_API_ENDPOINT,
    CLOUDFLARE_VISION_API_ENDPOINT,
    CLOUDFLARE_WHISPER_API_ENDPOINT,
    IMAGE_MODEL_ENDPOINTS,
    COGVIDEO_GRADIO_SPACE,
    GEMINI_IMAGE_EDIT_GRADIO_SPACE,
    LTX_VIDEO_GRADIO_SPACE,
    ACE_STEP_MUSIC_GRADIO_SPACE,
    PUPPETEER_EXECUTABLE_PATH,
    WEB_VERSION_CACHE_REMOTE_PATH,
    AUTH_DIR,
    MAX_LATEX_ERRORS_TO_KEEP,
    GRADLE_VERSION,
    APK_BUILD_BASE_DIR,
    ANDROID_SDK_PATH,
};
