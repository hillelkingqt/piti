document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (same as before) ---
    const chatListUl = document.getElementById('chat-list');
    const chatMessagesContainer = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const newChatBtn = document.getElementById('new-chat-btn');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const usernameModal = document.getElementById('username-modal');
    const usernameInput = document.getElementById('username-input');
    const saveUsernameBtn = document.getElementById('save-username-btn');
    const userGreetingSpan = document.getElementById('user-greeting');
    const currentChatTitle = document.getElementById('current-chat-title');
    const darkModeIcon = darkModeToggle.querySelector('i');
    const appContainer = document.querySelector('.app-container');

    // Profile Modal Elements
    const profileBtn = document.getElementById('profile-btn');
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModalBtn = document.getElementById('close-profile-modal-btn');
    const profileNameInput = document.getElementById('profile-name-input');
    const profileEmailInput = document.getElementById('profile-email-input');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const logoutBtnProfileModal = document.getElementById('logout-btn-profile-modal');


    // --- State (same as before) ---
    let username = localStorage.getItem('pithi_username');
    let chats = [];
    let currentChatId = null;
    let chatHistories = {};
    let isProcessing = false;

    // --- Initialization (same as before) ---
    function initializeApp() {
        appContainer.style.opacity = '0';
        if (!username) { promptForUsername(); } else { greetUser(); loadInitialData(); }
        setupDarkMode(); setupEventListeners(); adjustTextareaHeight();
        messageInput.addEventListener('input', adjustTextareaHeight);
        messageInput.addEventListener('keydown', handleInputKeydown);
        requestAnimationFrame(() => { appContainer.style.opacity = '1'; appContainer.style.transition = 'opacity 0.5s ease-in'; });
    }

    async function loadInitialData() { /* ... same as before ... */
        await loadChatList();
        if (chats.length > 0 && !currentChatId) await setActiveChat(chats[0].id);
        if (chats.length === 0) createNewChat(true);
    }

    function setupEventListeners() { /* ... same as before ... */
        saveUsernameBtn.addEventListener('click', handleSaveUsername);
        usernameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter' && usernameInput.value.trim()) handleSaveUsername(); });
        darkModeToggle.addEventListener('click', toggleDarkMode);
        newChatBtn.addEventListener('click', () => createNewChat(true));
        sendButton.addEventListener('click', handleSendMessage);

        // Profile Modal Listeners
        if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
        if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
        if (saveProfileBtn) saveProfileBtn.addEventListener('click', handleSaveProfile);
        if (logoutBtnProfileModal) logoutBtnProfileModal.addEventListener('click', handleLogout);
    }

    // --- Profile Modal Functions ---
    function openProfileModal() {
        if (!username) { // Should not happen if profile button is only shown when logged in
            promptForUsername();
            return;
        }
        profileNameInput.value = username;
        // Attempt to retrieve email from localStorage.
        // This assumes that the email is stored there after authentication.
        // The GoogleAuthService.js was modified to GET email, but not necessarily store it for frontend.
        // A more robust solution would involve a dedicated user info service or endpoint.
        const userEmail = localStorage.getItem('pithi_useremail') || '';
        profileEmailInput.value = userEmail;
        profileEmailInput.readOnly = true; // Ensure it's read-only as per requirement

        profileModal.classList.add('show');
    }

    function closeProfileModal() {
        profileModal.classList.remove('show');
    }

    function handleSaveProfile() {
        const newName = profileNameInput.value.trim();
        if (newName && newName.length < 50 && newName !== username) {
            username = newName;
            localStorage.setItem('pithi_username', username);
            greetUser(); // Updates the greeting span
            // Optionally, provide user feedback e.g., a small temporary message
            console.log("Profile username updated.");
        } else if (newName === username) {
            // No change, or just close
        } else {
            alert("שם משתמש לא תקין. אנא הכנס/י שם באורך עד 50 תווים.");
            return; // Don't close modal if input is invalid
        }
        closeProfileModal();
    }

    function handleLogout() {
        closeProfileModal();

        // Clear user-specific data from localStorage
        localStorage.removeItem('pithi_username');
        localStorage.removeItem('pithi_useremail'); // Clear email if stored
        // Consider clearing other settings that might be user-specific
        // localStorage.removeItem('pithi_dark_mode'); // Or reset to default
        // localStorage.removeItem('pithi_current_chat_id'); // Clear last active chat
        // localStorage.removeItem('pithi_chat_histories'); // This might be large, better managed by apiService on username change

        // Reset global state variables
        username = null;
        chats = [];
        currentChatId = null;
        chatHistories = {};

        // Update UI
        renderChatList(); // Clears and shows "create new chat" message
        userGreetingSpan.textContent = 'שלום, אורח!'; // Reset greeting
        currentChatTitle.textContent = 'פיתי'; // Reset chat title
        chatMessagesContainer.innerHTML = '<div class="system-message">התנתקת בהצלחה.</div>'; // Clear messages and show logout confirmation
        messageInput.disabled = true; // Disable input as no active chat/user

        // Show the initial username prompt modal
        promptForUsername();
        console.log("User logged out.");
    }


    function setupDarkMode() { /* ... same as before ... */
        const prefersDark = localStorage.getItem('pithi_dark_mode') === 'true';
        document.body.classList.toggle('dark-mode', prefersDark);
        if(prefersDark) { darkModeIcon.classList.replace('fa-moon', 'fa-sun'); darkModeIcon.style.color = '#f1c40f'; }
        else { darkModeIcon.classList.replace('fa-sun', 'fa-moon'); darkModeIcon.style.color = ''; }
    }

    function promptForUsername() { /* ... same as before ... */ usernameModal.classList.add('show'); usernameInput.focus(); }
    function handleSaveUsername() { /* ... same as before ... */
         const nameInput = usernameInput.value.trim();
         if (nameInput && nameInput.length < 50) { username = nameInput; localStorage.setItem('pithi_username', username); usernameModal.classList.remove('show'); greetUser(); loadInitialData(); }
         else { alert("אנא הכנס/י שם חוקי (עד 50 תווים)."); }
     }
    function greetUser() { /* ... same as before ... */ if (username) userGreetingSpan.textContent = `שלום, ${username}!`; }
    function toggleDarkMode() { /* ... same as before ... */ const isDark = document.body.classList.toggle('dark-mode'); localStorage.setItem('pithi_dark_mode', isDark); setupDarkMode(); }

    // --- Chat Management (same load/render/save placeholders as before) ---
    async function loadChatList() { /* ... using apiService.loadChats ... */
         if (!username) return;
        try {
            chats = await apiService.loadChats(username) || [];
            renderChatList();
        } catch (error) { console.error("Error loading chat list:", error); renderChatList(); }
    }
    function renderChatList() { /* ... same as before ... */
         chatListUl.innerHTML = '';
         if (!chats || chats.length === 0) { const li = document.createElement('li'); li.textContent = "לחץ '+' ליצירת צ'אט"; li.style.padding='14px 20px'; li.style.fontStyle="italic"; li.style.color="var(--text-secondary)"; chatListUl.appendChild(li); return; }
         chats.forEach(chat => { const li = document.createElement('li'); li.className = 'chat-list-item'; li.dataset.chatId = chat.id; li.textContent = chat.name || `צ'אט (${chat.id.slice(-4)})`; li.title = chat.lastMessage ? `הודעה אחרונה: ${chat.lastMessage.substring(0,100)}` : "צ'אט חדש"; if (chat.id === currentChatId) li.classList.add('active'); li.addEventListener('click', () => setActiveChat(chat.id)); chatListUl.appendChild(li); });
     }
     async function setActiveChat(chatId) { /* ... same as before ... */
          if (isProcessing || currentChatId === chatId) return;
          currentChatId = chatId; console.log("Activating chat:", chatId);
          messageInput.disabled = true; chatMessagesContainer.innerHTML = `<div class="loading-history"><i class="fas fa-spinner fa-spin"></i> טוען היסטוריה...</div>`;
          chatListUl.querySelectorAll('.chat-list-item.active').forEach(el => el.classList.remove('active'));
          const newActiveEl = chatListUl.querySelector(`[data-chat-id="${chatId}"]`); if (newActiveEl) newActiveEl.classList.add('active');
          const currentChat = chats.find(c => c.id === chatId); currentChatTitle.textContent = currentChat ? (currentChat.name || `צ'אט (${chatId.slice(-4)})`) : "טוען צ'אט...";
          await loadChatHistory(chatId); messageInput.disabled = false; messageInput.focus();
      }
    async function loadChatHistory(chatId) { /* ... using apiService.getChatHistory ... */
         try { const history = await apiService.getChatHistory(chatId) || []; chatHistories[chatId] = history; renderMessages(chatId); }
         catch (error) { console.error(`Error loading history for ${chatId}:`, error); chatMessagesContainer.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-circle"></i> שגיאה בטעינת ההיסטוריה.</div>`; }
    }
    function renderMessages(chatId) { /* ... same as before ... */
         chatMessagesContainer.innerHTML = ''; const history = chatHistories[chatId] || [];
         if (history.length === 0) { addMessageToDisplay('system', 'זו ההתחלה של השיחה שלך עם פיתי. כתוב/י משהו!', false, `sys_${chatId}_start`, null); }
         else { history.forEach(msg => addMessageToDisplay(msg.sender, msg.text, msg.sender === 'user', msg.id, msg.actionData)); }
         scrollToBottom(true);
     }
     async function createNewChat(setActive = true) { /* ... using apiService.saveChats & saveChatHistory ... */
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const newChat = { id: newChatId, name: `שיחה חדשה (${new Date().toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })})`, lastMessage: "" };
        chats.unshift(newChat); chatHistories[newChatId] = [];
        try { await apiService.saveChats(username, chats); await apiService.saveChatHistory(newChatId, []); } catch (error) { console.error("Error saving new chat data:", error); }
        renderChatList(); if (setActive) await setActiveChat(newChatId);
    }
     function updateChatListPreview(chatId, messageText, newName = null) { /* ... using apiService.saveChats & renameChatOnServer (placeholder) ... */
          const listItem = chatListUl.querySelector(`[data-chat-id="${chatId}"]`);
          const chatIndex = chats.findIndex(c => c.id === chatId); if (chatIndex === -1) return;
          if (newName) chats[chatIndex].name = newName; chats[chatIndex].lastMessage = messageText;
          if (listItem) { if (newName) listItem.textContent = newName; const preview = messageText.length > 40 ? messageText.substring(0, 37) + '...' : messageText; listItem.title = `הודעה אחרונה: ${preview}`; }
          if(chatIndex > 0) { const [movedChat] = chats.splice(chatIndex, 1); chats.unshift(movedChat); renderChatList(); const activeEl = chatListUl.querySelector(`[data-chat-id="${currentChatId}"]`); if (activeEl) activeEl.classList.add('active'); }
          else if (listItem && newName) { listItem.textContent = newName; }
          apiService.saveChats(username, chats).catch(err => console.error("Failed save preview update", err)); // Debounce needed
    }


    // --- Message Sending / Receiving ---
    async function handleSendMessage() {
        if (isProcessing) return;
        const userText = messageInput.value.trim();
        if (!userText || !currentChatId) return;

        isProcessing = true; sendButton.disabled = true; sendButton.classList.add('sending');

        // 1. Add User Msg
        const userMessageId = `msg_${Date.now()}_u`;
        const userMessage = { sender: 'user', text: userText, id: userMessageId, actionData: null };
        addMessageToDisplay('user', userText, true, userMessageId);
        if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
        chatHistories[currentChatId].push(userMessage);

        // 2. Update Preview & Clear
        const isFirst = chatHistories[currentChatId].length === 1;
         updateChatListPreview(currentChatId, `אני: ${userText}`);
        messageInput.value = ''; adjustTextareaHeight(); showTypingIndicator(true);

        // 3. Prepare Context
        const historyForContext = (chatHistories[currentChatId] || []).slice(-10)
             .filter(msg => msg.sender !== 'system')
             .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text || '' }]
            }));

        // 4. Call Gemini
        try {
            const responseData = await generateGeminiContent( historyForContext.slice(0, -1), userText, isFirst );
            const aiResponseJson = extractGeminiResponse(responseData);
            console.log("Parsed AI Response:", aiResponseJson);
            showTypingIndicator(false);

            // Handle chat name suggestion FIRST
             let newChatName = null;
             if (isFirst && aiResponseJson.chatName) {
                 newChatName = aiResponseJson.chatName.substring(0, 50);
                 console.log(`AI Suggested Chat Name: "${newChatName}"`);
                 updateChatListPreview(currentChatId, `פיתי: ${aiResponseJson.message || ''}`, newChatName);
                 currentChatTitle.textContent = newChatName;
                 apiService.renameChatOnServer(currentChatId, newChatName, username) // placeholder
                    .catch(err => console.error("Failed to save new chat name", err));
             }

            // Handle the main AI action, pass name for context only
            handleAiResponseAction(aiResponseJson, newChatName);

        } catch (error) {
            console.error("Error during AI processing:", error);
            showTypingIndicator(false);
            const errorText = `שגיאה בתקשורת עם פיתי: ${error.message || 'שגיאה לא ידועה'}`;
             const errorMessage = { sender: 'ai', text: errorText, id: `err_${Date.now()}`, actionData: null };
            addMessageToDisplay('ai', errorText, false, errorMessage.id, { error: true });
            if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
            chatHistories[currentChatId].push(errorMessage);
             updateChatListPreview(currentChatId, errorText.substring(0, 30) + '...');
             // Use await only if saveChatHistory returns a meaningful promise you need to wait for
            apiService.saveChatHistory(currentChatId, chatHistories[currentChatId]).catch(e=>console.error("Save failed",e));
        } finally {
             isProcessing = false; sendButton.disabled = false; sendButton.classList.remove('sending'); messageInput.focus();
        }
    }

    /**
     * Handles the specific 'action' defined in the AI's JSON response.
     * Calls backend placeholders for actions requiring secure handling or heavy lifting.
     * @param {object} aiJsonResponse - The parsed JSON object from Gemini.
     * @param {string|null} suggestedChatName - Used for context if needed.
     */
    async function handleAiResponseAction(aiJsonResponse, suggestedChatName = null) {
        const aiMessageId = `msg_${Date.now()}_ai`;
        const baseMessageText = aiJsonResponse.message || '';
        const action = aiJsonResponse.action || 'text';

        // Store the full AI response in history
        const aiMessageObject = { sender: 'ai', text: baseMessageText, id: aiMessageId, actionData: aiJsonResponse };

        // Display base/loading message & save initial part
        addMessageToDisplay('ai', baseMessageText, false, aiMessageId, aiJsonResponse);
        if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
        chatHistories[currentChatId].push(aiMessageObject);
        // Update preview *without* potentially changed name here again, handled in caller
        updateChatListPreview(currentChatId, baseMessageText.substring(0, 30) + '...');
        // Await history saving
        await apiService.saveChatHistory(currentChatId, chatHistories[currentChatId])
               .catch(e => console.error("Save failed after adding AI base msg", e));


        // --- Handle specific actions ---
         try {
            switch (action) {
                // =========================================
                // MODIFIED: Calls insecure frontend service
                // =========================================
// In script.js -> handleAiResponseAction
case 'generate_image':
    const prompt = aiJsonResponse.imagePrompt;
    const model = aiJsonResponse.imageModel;
    if (prompt) {
        updateMessageStatus(aiMessageId, `<i class="fas fa-spinner fa-spin status-icon"></i> יוצר תמונה (${model})...`, true);
        // --- CALL YOUR BACKEND VIA apiService ---
        const result = await apiService.generateImageOnServer(prompt, model);
        // ---
        if (result.success && result.imageDataBase64) {
            // ...(display image using result.imageDataBase64 and result.mimeType)...
            const imgElement = document.createElement('img');
            imgElement.src = `data:${result.mimeType};base64,${result.imageDataBase64}`;
            imgElement.alt = prompt.substring(0, 50);
            imgElement.classList.add('generated-image');
            replaceMessageContent(aiMessageId, imgElement, `הנה תמונה עבור: ${prompt.substring(0,30)}...`);
        } else {
            // ...(display error using result.error)...
            updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> נכשלה יצירת התמונה. ${result.error || ''}`, false);
        }
    }
    break;

                 // ============================================================
                 // !! REQUIRES BACKEND !! Cannot work securely from frontend
                 // ============================================================
                 case 'send_email':
                    updateMessageStatus(aiMessageId, `<i class="fas fa-spinner fa-spin status-icon"></i> מנסה לשלוח אימייל (דרך השרת)...`, true);
                     const emailData = { to: aiJsonResponse.to, subject: aiJsonResponse.subject, html: aiJsonResponse.html };
                    if (emailData.to && emailData.subject && emailData.html) {
                         const result = await apiService.sendEmailOnServer(emailData); // Uses PLACEHOLDER
                         const statusIcon = result.success ? 'fa-check-circle success-icon' : 'fa-exclamation-circle error-icon';
                        updateMessageStatus(aiMessageId, `<i class="fas ${statusIcon}"></i> ${result.message || (result.success ? 'בקשת המייל נשלחה לשרת.' : 'שגיאה בשליחת המייל.')}`, false);
                    } else {
                         updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> פרטים חסרים לשליחת מייל.`, false);
                     }
                     break;

                // =============================================
                // Other Actions (Mostly Client-Side Handling)
                // =============================================
                 case 'create_file':
                    if(aiJsonResponse.fileType && aiJsonResponse.filename && typeof aiJsonResponse.fileContent !== 'undefined') {
                        try {
                            const blob = new Blob([aiJsonResponse.fileContent], { type: getMimeType(aiJsonResponse.fileType) });
                            const url = URL.createObjectURL(blob); const link = document.createElement('a');
                            link.href = url; link.download = `${aiJsonResponse.filename}.${aiJsonResponse.fileType}`;
                            link.innerHTML = `<i class="fas fa-download"></i> הורד: ${link.download}`;
                            link.classList.add('generated-download');
                            replaceMessageContent(aiMessageId, link, baseMessageText); // Keep base text
                         } catch (e) {
                             console.error("Error creating download link:", e);
                            updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> שגיאה ביצירת קישור.`, false);
                        }
                    } else {
                        updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> פרטים חסרים ליצירת קובץ.`, false);
                     }
                     break;

                 case 'tts':
                    if(aiJsonResponse.text) {
                         updateMessageStatus(aiMessageId, `<i class="fas fa-spinner fa-spin status-icon"></i> מפיק אודיו...`, true);
                        const result = await apiService.generateTtsOnServer(aiJsonResponse.text); // Placeholder
                        if(result.success && result.audioUrl) {
                            const audioElement = document.createElement('audio'); audioElement.src = result.audioUrl; audioElement.controls = true; audioElement.style.maxWidth='100%';
                            replaceMessageContent(aiMessageId, audioElement, baseMessageText);
                         } else { updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> שגיאה בהפקת אודיו. ${result.error || ''}`, false); }
                    } else { updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> טקסט חסר להקראה.`, false); }
                     break;

                 case 'generate_barcode':
                    if(aiJsonResponse.text) {
                        await generateAndDisplayBarcode(aiJsonResponse.text, aiMessageId, baseMessageText);
                     } else { updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> טקסט חסר לברקוד.`, false); }
                     break;

                case 'site_search': case 'youtube_search':
                    if(aiJsonResponse.query) {
                        const searchType = aiJsonResponse.action === 'youtube_search' ? 'YouTube' : 'Web';
                         updateMessageStatus(aiMessageId, `<i class="fas fa-spinner fa-spin status-icon"></i> מחפש (${searchType})...`, true);
                         // *** Backend Required Here Ideally ***
                        console.log(`Placeholder: Would call backend to search ${searchType} for: ${aiJsonResponse.query}`);
                         await new Promise(r => setTimeout(r, 1500)); // Simulate search delay
                         const fakeResults = [ { title: `תוצאת דמה 1 (${searchType})`, url: '#'}, { title: `תוצאת דמה 2 (${searchType})`, url: '#', snippet: 'תיאור קצר...'}];
                         appendSearchResults(fakeResults, aiMessageId, baseMessageText, searchType === 'YouTube');
                    } else { updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> שאילתת חיפוש חסרה.`, false); }
                     break;

                // --- Add other action handlers ---
                 // case 'many': handleManyAction(...); break;
                 // case 'poll': handlePollAction(...); break;
                // case 'reminder': handleReminderAction(...); break; // Needs client-side timer logic or backend persistence

                case 'text': default:
                     // Simple text message - already displayed. Might remove status if added unnecessarily.
                    const statusEl = document.getElementById(aiMessageId)?.querySelector('.message-status');
                    if(statusEl?.textContent.includes("מעבד")) statusEl.remove(); // Clean up if loading was shown
                    break;
            }
         } catch (actionError) {
             console.error(`Error handling AI action "${action}":`, actionError);
            updateMessageStatus(aiMessageId, `<i class="fas fa-exclamation-circle error-icon"></i> שגיאה בביצוע פעולה "${action}".`, false);
         }
    }


    // --- UI Helpers (mostly same as before, ensure functions exist) ---

    function addMessageToDisplay(sender, text, isUser, messageId, actionData = null) { /* ... (same as previous enhanced) ... */
         const messageWrapper = document.createElement('div'); messageWrapper.className = `message ${isUser ? 'user-message' : 'ai-message'}`; messageWrapper.id = messageId;
         const bubble = document.createElement('div'); bubble.className = 'message-bubble';
         const sanitizedText = (text || '').replace(/</g, "<").replace(/>/g, ">").replace(/\*([^*]+)\*/g,'<strong>$1</strong>').replace(/_([^_]+)_/g,'<i>$1</i>').replace(/~([^~]+)~/g,'<del>$1</del>').replace(/```([^`]+)```/g,'<code>$1</code>').replace(/\n/g, '<br>');
         bubble.innerHTML = sanitizedText; messageWrapper.appendChild(bubble); chatMessagesContainer.appendChild(messageWrapper);
         if (!isUser && actionData && ( actionData.action === 'generate_image' || actionData.action === 'send_email' || actionData.action === 'tts' || actionData.action === 'site_search' || actionData.action === 'youtube_search') && !actionData.error) {
             updateMessageStatus(messageId, `<i class="fas fa-spinner fa-spin status-icon"></i> מעבד...`, true);
         } else if (!isUser && actionData && actionData.error) { // Show error if passed in actionData
             updateMessageStatus(messageId, `<i class="fas fa-exclamation-circle error-icon"></i> ${text}`, false);
         }
         if (!document.querySelector('.loading-history')) { scrollToBottom(); }
     }
    function updateMessageStatus(messageId, newContentHTML, isLoading) { /* ... (same as previous enhanced) ... */
         const messageDiv = document.getElementById(messageId); const bubble = messageDiv?.querySelector('.message-bubble'); if (!bubble) return;
         let statusEl = bubble.querySelector('.message-status');
         if (!statusEl) { statusEl = document.createElement('div'); statusEl.className = 'message-status'; statusEl.style.fontSize = '0.85em'; statusEl.style.marginTop = '6px'; statusEl.style.opacity = '0.8'; statusEl.style.borderTop = '1px dashed var(--border-color)'; statusEl.style.paddingTop = '6px'; statusEl.style.display = 'flex'; statusEl.style.alignItems = 'center'; statusEl.style.gap = '5px'; bubble.appendChild(statusEl); }
         statusEl.innerHTML = newContentHTML; statusEl.style.color = isLoading ? 'var(--text-secondary)' : ''; if(!isLoading) statusEl.style.borderTop = ''; scrollToBottom();
    }
    function replaceMessageContent(messageId, elementToInsert, originalText = null) { /* ... (same as previous enhanced) ... */
         const bubble = document.getElementById(messageId)?.querySelector('.message-bubble'); if (!bubble) return;
         const statusEl = bubble.querySelector('.message-status'); if(statusEl) statusEl.remove();
         if (originalText && typeof originalText === 'string' && originalText.trim() !== '' && bubble.textContent.includes(originalText)) {
            // If original text is significant and present, append after it
             if(!bubble.innerHTML.includes(originalText.replace(/</g, "<"))) { // Basic check if text needs resetting
                  bubble.innerHTML = originalText.replace(/</g, "<").replace(/>/g, ">").replace(/\n/g, '<br>'); // Reset/Sanitize
             }
            bubble.appendChild(document.createElement('br'));
            bubble.appendChild(elementToInsert);
        } else { bubble.innerHTML = ''; bubble.appendChild(elementToInsert); } // Otherwise replace
        scrollToBottom();
    }
    async function generateAndDisplayBarcode(textToEncode, messageId, baseText) { /* ... (same enhanced logic using placeholder) ... */
         console.log(`Generating barcode for: "${textToEncode}"`); updateMessageStatus(messageId, `<i class="fas fa-spinner fa-spin status-icon"></i> יוצר ברקוד...`, true);
         try { await new Promise(r => setTimeout(r, 500)); const placeholder = document.createElement('div'); placeholder.textContent = `[ ברקוד QR עבור: "${textToEncode.substring(0, 30)}..." ]`; placeholder.style.fontFamily = 'monospace'; placeholder.style.padding = '10px'; placeholder.style.border = '1px dashed var(--text-secondary)'; placeholder.style.marginTop = '8px'; placeholder.style.display = 'inline-block'; placeholder.classList.add('generated-barcode'); replaceMessageContent(messageId, placeholder, baseText); }
         catch (err) { console.error('Error generating barcode:', err); updateMessageStatus(messageId, `<i class="fas fa-exclamation-circle error-icon"></i> שגיאה ביצירת ברקוד.`, false); }
     }
     function appendSearchResults(results, messageId, baseText, isYoutube = false) { /* ... (same enhanced logic) ... */
         const bubble = document.getElementById(messageId)?.querySelector('.message-bubble'); const statusEl = bubble?.querySelector('.message-status'); if (!bubble) return; if(statusEl) statusEl.remove();
         if (baseText && typeof baseText === 'string' && baseText.trim() !== '') { if(!bubble.innerHTML.includes(baseText.replace(/</g,"<"))){bubble.innerHTML=baseText.replace(/</g,"<").replace(/>/g,">").replace(/\n/g,'<br>');} } else { bubble.innerHTML = ''; }
         if (!results || results.length === 0) { bubble.appendChild(document.createElement('br')); bubble.appendChild(document.createTextNode(" לא נמצאו תוצאות.")); return; }
         const list = document.createElement('ul'); list.className = 'search-results-list'; list.style.cssText = "margin-top:10px; padding-right:20px; list-style:none; border-top: 1px dashed var(--border-color); padding-top: 10px;";
         results.slice(0, isYoutube ? 2 : 3).forEach(result => { const item=document.createElement('li'); item.className='search-result-item'; const link=document.createElement('a'); const details=document.createElement('div'); details.className='result-details'; if(typeof result==='string'){ link.href=result; link.textContent = result.length > 60 ? result.substring(0, 57)+'...' : result; } else if(typeof result==='object'){ link.href=result.url; link.textContent=result.title||(result.url.length>60?result.url.substring(0,57)+'...':result.url); if(result.snippet){ details.textContent = result.snippet;} } link.target="_blank"; link.rel="noopener noreferrer"; item.appendChild(link); if(details.textContent) item.appendChild(details); list.appendChild(item); });
         bubble.appendChild(list); scrollToBottom();
    }
     function showTypingIndicator(show) { /* ... (same as enhanced previous version) ... */
         const existing = chatMessagesContainer.querySelector('.typing-indicator'); if(show && !existing){ const ind=document.createElement('div'); ind.className='message ai-message typing-indicator'; ind.innerHTML = `<div class="message-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`; chatMessagesContainer.appendChild(ind); scrollToBottom(); } else if(!show && existing){ existing.remove(); }
    }
    function scrollToBottom(force = false) { /* ... (same as enhanced previous version) ... */
         const t=100; const isNear = chatMessagesContainer.scrollHeight - chatMessagesContainer.scrollTop - chatMessagesContainer.clientHeight < t; if(force || isNear){ requestAnimationFrame(()=>{chatMessagesContainer.scrollTo({top:chatMessagesContainer.scrollHeight, behavior:'smooth'}); }); }
     }
    function adjustTextareaHeight() { /* ... (same enhanced previous version) ... */
         messageInput.style.height='auto'; let sh=messageInput.scrollHeight; if(sh > parseFloat(messageInput.style.minHeight||'0')) { messageInput.style.height=`${sh}px`; } const mh=130; messageInput.style.overflowY=(sh>mh)?'auto':'hidden'; if(sh>mh){ messageInput.style.height=`${mh}px`; }
    }
    function handleInputKeydown(e) { /* ... (same enhanced previous version) ... */ if(e.key==='Enter'&&!e.shiftKey&&!isProcessing){e.preventDefault();handleSendMessage();} }
    function getMimeType(fileType) { /* ... (same enhanced previous version) ... */
        switch (fileType?.toLowerCase()){ case 'txt': return 'text/plain'; case 'html': return 'text/html'; case 'css': return 'text/css'; case 'js': return 'application/javascript'; case 'json': return 'application/json'; case 'csv': return 'text/csv'; case 'py': return 'text/x-python'; case 'pdf': return 'application/pdf'; case 'png': return 'image/png'; case 'jpg': case 'jpeg': return 'image/jpeg'; case 'gif': return 'image/gif'; case 'mp3': return 'audio/mpeg'; case 'wav': return 'audio/wav'; default: return 'application/octet-stream'; }
    }

    // --- Start the app ---
    initializeApp();
});