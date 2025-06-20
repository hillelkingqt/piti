const fs = require('fs');
const path = require('path');

// Assuming utilityHelpers.js is in the same directory (./utilityHelpers.js)
// For getLocalTimestamp, normalizeMsgId - these are used by safelyAppendMessage which is not being moved yet.
// const { getLocalTimestamp, normalizeMsgId, getSafeNameForChat } = require('./utilityHelpers.js');

const BASE_CHAT_DIR = path.join(__dirname, '..', 'chats'); // Correctly define BASE_CHAT_DIR relative to this file's parent
const PENDING_ACTIONS_PATH_GLOBAL = path.join(__dirname, '..', 'pending_actions.json'); // Path for pending_actions.json in the root

function getChatPaths(chatId, safeName) {
    const chatDir = path.join(BASE_CHAT_DIR, safeName);
    return {
        chatDir: chatDir,
        historyFile: path.join(chatDir, 'chat_history.txt'), // Changed from history.txt to chat_history.txt to match existing helper
        memoryFile: path.join(chatDir, 'memories.json'),    // Changed from memory.json to memories.json
        generatedFilesIndex: path.join(chatDir, 'generated_files.json'),
        filesDir: path.join(chatDir, 'files'),
        triggersFile: path.join(chatDir, 'triggers.json'),
        // pendingActionsFile: path.join(chatDir, 'pending_actions.json'), // Pending actions are global, not per-chat
        latexErrorsFile: path.join(chatDir, 'latex_errors.json')
    };
}

function loadMemories(chatPaths) {
    const memoryFilePath = chatPaths.memoryFile;
    if (fs.existsSync(memoryFilePath)) {
        try {
            const data = fs.readFileSync(memoryFilePath, 'utf8');
            const memories = JSON.parse(data);
            if (Array.isArray(memories)) {
                // Sort by timestamp descending if they have it
                return memories.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }
            console.warn(`[Memories] ${memoryFilePath} did not contain an array. Returning empty.`);
            return [];
        } catch (e) {
            console.error(`❌ Error reading or parsing ${memoryFilePath}:`, e);
            return [];
        }
    }
    return [];
}

function saveMemories(chatPaths, memories) {
    const memoryFilePath = chatPaths.memoryFile;
    try {
        if (!Array.isArray(memories)) {
            console.error(`❌ Attempted to save non-array data to ${memoryFilePath}. Aborting save.`);
            return;
        }
        fs.mkdirSync(chatPaths.chatDir, { recursive: true });
        fs.writeFileSync(memoryFilePath, JSON.stringify(memories, null, 2), 'utf8');
        console.log(`💾 Successfully saved ${memories.length} memories to ${memoryFilePath}`);
    } catch (e) {
        console.error(`❌ Error writing to ${memoryFilePath}:`, e);
        // Consider how to notify admin if client/myId are not available here
    }
}

function loadTriggers(chatPaths) {
    const triggersFilePath = chatPaths.triggersFile;
    if (fs.existsSync(triggersFilePath)) {
        try {
            const data = fs.readFileSync(triggersFilePath, 'utf8');
            const triggers = JSON.parse(data);
            if (Array.isArray(triggers)) {
                // Sort by timestamp descending if they have it
                return triggers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }
            console.warn(`[Triggers] ${triggersFilePath} for ${chatPaths.chatDir} did not contain an array. Returning empty.`);
            return [];
        } catch (e) {
            console.error(`❌ Error reading or parsing ${triggersFilePath}:`, e);
            return [];
        }
    }
    return [];
}

function saveTriggers(chatPaths, triggers) {
    const triggersFilePath = chatPaths.triggersFile;
    try {
        if (!Array.isArray(triggers)) {
            console.error(`❌ Attempted to save non-array data to ${triggersFilePath}. Aborting save.`);
            return;
        }
        fs.mkdirSync(chatPaths.chatDir, { recursive: true });
        fs.writeFileSync(triggersFilePath, JSON.stringify(triggers, null, 2), 'utf8');
        console.log(`💾 Successfully saved ${triggers.length} triggers to ${triggersFilePath}`);
    } catch (e) {
        console.error(`❌ Error writing to ${triggersFilePath}:`, e);
    }
}

function loadPendingActions() {
    if (fs.existsSync(PENDING_ACTIONS_PATH_GLOBAL)) {
        try {
            const data = fs.readFileSync(PENDING_ACTIONS_PATH_GLOBAL, 'utf8');
            const actions = JSON.parse(data);
            return Array.isArray(actions) ? actions : [];
        } catch (e) {
            console.error("❌ Error reading or parsing pending_actions.json:", e);
            return [];
        }
    }
    return [];
}

function savePendingActions(actions) {
    try {
        if (!Array.isArray(actions)) {
            console.error("❌ Attempted to save non-array data to pending_actions.json. Aborting save.");
            return;
        }
        fs.writeFileSync(PENDING_ACTIONS_PATH_GLOBAL, JSON.stringify(actions, null, 2), 'utf8');
        console.log(`💾 Successfully saved ${actions.length} pending actions to ${PENDING_ACTIONS_PATH_GLOBAL}.`);
    } catch (e) {
        console.error(`❌ Error writing to pending_actions.json:`, e);
    }
}

const MAX_LATEX_ERRORS_TO_KEEP = 5;

function loadLatexErrors(chatPaths) {
    const errorFilePath = chatPaths.latexErrorsFile;
    if (fs.existsSync(errorFilePath)) {
        try {
            const data = fs.readFileSync(errorFilePath, 'utf8');
            const errors = JSON.parse(data);
            if (Array.isArray(errors)) {
                return errors;
            }
        } catch (e) {
            console.error(`❌ Error reading or parsing ${errorFilePath}:`, e);
        }
    }
    return [];
}

function saveLatexError(chatPaths, newErrorLog) {
    const errorFilePath = chatPaths.latexErrorsFile;
    let errors = loadLatexErrors(chatPaths);
    errors.unshift({
        timestamp: new Date().toISOString(),
        errorLog: newErrorLog.substring(0, 1500) // Keep it reasonably sized
    });
    if (errors.length > MAX_LATEX_ERRORS_TO_KEEP) {
        errors = errors.slice(0, MAX_LATEX_ERRORS_TO_KEEP);
    }
    try {
        fs.mkdirSync(chatPaths.chatDir, { recursive: true });
        fs.writeFileSync(errorFilePath, JSON.stringify(errors, null, 2), 'utf8');
        console.log(`💾 Saved LaTeX error log to ${errorFilePath}`);
    } catch (e) {
        console.error(`❌ Error writing LaTeX error log to ${errorFilePath}:`, e);
    }
}

module.exports = {
  getChatPaths,
  loadMemories,
  saveMemories,
  loadTriggers,
  saveTriggers,
  loadPendingActions,
  savePendingActions,
  loadLatexErrors,
  saveLatexError
};
