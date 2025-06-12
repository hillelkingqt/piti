// adminPanel.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const openAdminPanelBtn = document.getElementById('open-admin-panel-btn');
    const adminManagementPanel = document.getElementById('admin-management-panel');
    const closeAdminPanelBtn = document.getElementById('close-admin-panel-btn');

    const addAdminForm = document.getElementById('add-admin-form');
    const adminEmailInput = document.getElementById('admin-email-input');
    const adminTemporaryCheckbox = document.getElementById('admin-temporary-checkbox');
    const adminDurationSection = document.getElementById('admin-duration-section');
    const adminDurationDaysInput = document.getElementById('admin-duration-days-input');
    const addAdminSubmitBtn = document.getElementById('add-admin-submit-btn');

    const adminListContainer = document.getElementById('admin-list-container');
    const addAdminSection = document.getElementById('add-admin-section');

    let currentUsername = null;
    let currentUserIsMainAdmin = false;
    let currentUserIsAnyAdmin = false;

    // Attempt to get username, wait if not immediately available
    function getUsernameFromStorage() {
        currentUsername = localStorage.getItem('pithi_username');
        if (currentUsername) {
            initializeAdminPanel();
        } else {
            // Fallback or wait slightly if script.js sets it later
            console.warn('Admin Panel: Username not found in localStorage on initial load. Will retry shortly.');
            setTimeout(() => {
                currentUsername = localStorage.getItem('pithi_username');
                if (currentUsername) initializeAdminPanel();
                else console.error('Admin Panel: Username still not found. Panel may not function correctly.');
            }, 1500);
        }
    }

    async function initializeAdminPanel() {
        if (!currentUsername) {
            console.warn('Admin Panel: No current user identified. Panel will remain hidden.');
            return;
        }

        const statusCheck = await apiService.checkAdminStatus(currentUsername);
        if (statusCheck.success && statusCheck.data.isAdmin) {
            currentUserIsAnyAdmin = true;
            currentUserIsMainAdmin = statusCheck.data.isMainAdmin;
            console.log(`Admin Panel: User ${currentUsername} is an admin. Main admin: ${currentUserIsMainAdmin}`);
        } else {
            console.log(`Admin Panel: User ${currentUsername} is not an admin or status check failed. Error: ${statusCheck.error}`);
        }

        setupEventListeners(); // Ensure this is called after status check
        updateAdminPanelVisibility(); // Update visibility based on status

        // Auto-load admins if panel is open (e.g. if it wasn't hidden by default due to CSS/JS load order)
        if (currentUserIsAnyAdmin && adminManagementPanel && !adminManagementPanel.classList.contains('hidden')) {
            loadAndDisplayAdmins();
        }
    }

    function setupEventListeners() {
        if (openAdminPanelBtn) {
            openAdminPanelBtn.addEventListener('click', () => {
                if (currentUserIsAnyAdmin && adminManagementPanel) {
                    adminManagementPanel.classList.remove('hidden');
                    loadAndDisplayAdmins();
                } else if (adminManagementPanel) { // If button somehow visible but user not admin
                    adminManagementPanel.classList.add('hidden'); // Ensure panel is hidden
                    alert('אין לך הרשאה לגשת לאזור זה.');
                }
            });
        }

        if (closeAdminPanelBtn) {
            closeAdminPanelBtn.addEventListener('click', () => {
                if (adminManagementPanel) adminManagementPanel.classList.add('hidden');
            });
        }

        if (adminTemporaryCheckbox) {
            adminTemporaryCheckbox.addEventListener('change', () => {
                if (adminDurationSection) {
                    adminDurationSection.classList.toggle('hidden', !adminTemporaryCheckbox.checked);
                    if (!adminTemporaryCheckbox.checked) {
                        if(adminDurationDaysInput) adminDurationDaysInput.value = '';
                    }
                }
            });
        }

        if (addAdminForm) {
            addAdminForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!currentUserIsMainAdmin) {
                    alert('אין לך הרשאה להוסיף מנהלים.');
                    return;
                }
                await handleAddAdmin();
            });
        }
    }

    function updateAdminPanelVisibility() {
        if (openAdminPanelBtn) {
            openAdminPanelBtn.classList.toggle('hidden', !currentUserIsAnyAdmin);
        }
        if (addAdminSection) {
            addAdminSection.classList.toggle('hidden', !currentUserIsMainAdmin);
        }
        // If user is not any admin, ensure the main panel itself is hidden
        if (!currentUserIsAnyAdmin && adminManagementPanel) {
             adminManagementPanel.classList.add('hidden');
        }
    }

    async function handleAddAdmin() {
        if (!adminEmailInput || !addAdminSubmitBtn) return;
        const email = adminEmailInput.value.trim();
        const isTemporary = adminTemporaryCheckbox ? adminTemporaryCheckbox.checked : false;
        const durationDays = adminDurationDaysInput ? (adminDurationDaysInput.value ? parseInt(adminDurationDaysInput.value) : null) : null;

        if (!email) {
            alert('יש להזין כתובת אימייל.');
            return;
        }
        if (isTemporary && (!durationDays || durationDays <= 0)) {
            alert('עבור מנהל זמני, יש להזין משך הרשאה חוקי (מספר ימים גדול מ-0).');
            return;
        }

        addAdminSubmitBtn.disabled = true;
        addAdminSubmitBtn.textContent = 'מוסיף...';

        const adminData = { email, isTemporary, durationDays };
        // currentUsername must be available here for the API call
        if (!currentUsername) {
             alert('שגיאה: לא זוהה משתמש נוכחי לשליחת הבקשה.');
             addAdminSubmitBtn.disabled = false;
             addAdminSubmitBtn.textContent = 'הוסף מנהל';
             return;
        }
        const result = await apiService.addSiteAdmin(adminData, currentUsername);

        if (result.success) {
            alert(`מנהל ${email} נוסף בהצלחה.`);
            if(adminEmailInput) adminEmailInput.value = '';
            if(adminTemporaryCheckbox) adminTemporaryCheckbox.checked = false;
            if(adminDurationDaysInput) adminDurationDaysInput.value = '';
            if(adminDurationSection) adminDurationSection.classList.add('hidden');
            await loadAndDisplayAdmins();
        } else {
            alert(`שגיאה בהוספת מנהל: ${result.error}`);
        }
        addAdminSubmitBtn.disabled = false;
        addAdminSubmitBtn.textContent = 'הוסף מנהל';
    }

    async function loadAndDisplayAdmins() {
        if (!adminListContainer || !currentUserIsAnyAdmin) {
             if(adminListContainer) adminListContainer.innerHTML = '<p>אין לך הרשאה לצפות ברשימה זו.</p>';
             return;
        }
        adminListContainer.innerHTML = '<p>טוען רשימת מנהלים...</p>';

        if (!currentUsername) { // Should not happen if panel is visible, but safeguard
             adminListContainer.innerHTML = '<p>שגיאה: לא זוהה משתמש נוכחי.</p>';
             return;
        }
        const result = await apiService.listSiteAdmins(currentUsername);

        if (result.success && Array.isArray(result.data)) {
            if (result.data.length === 0 && currentUserIsMainAdmin) {
                adminListContainer.innerHTML = '<p>לא קיימים מנהלים נוספים בחשבון.</p>';
            } else if (result.data.length === 0 && !currentUserIsMainAdmin) {
                adminListContainer.innerHTML = '<p>סטטוס המנהל שלך תקין. אין מנהלים נוספים להצגה.</p>';
            }
             else {
                renderAdminList(result.data);
            }
        } else {
            adminListContainer.innerHTML = `<p>שגיאה בטעינת רשימת המנהלים: ${result.error || 'שגיאה לא ידועה'}</p>`;
        }
    }

    function renderAdminList(admins) {
        if (!adminListContainer) return;
        adminListContainer.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'admin-list'; // For potential future styling

        admins.forEach(admin => {
            const li = document.createElement('li');
            // Inline styles for basic display, can be moved to CSS
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #eee';

            let statusText = admin.is_temporary ? 'זמני' : 'קבוע';
            if (admin.is_temporary && admin.expires_at) {
                try {
                    const expiryDate = new Date(admin.expires_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' });
                    statusText += ` (פג תוקף: ${expiryDate})`;
                } catch (e) {
                    console.error("Error formatting date:", admin.expires_at, e);
                    statusText += ` (פג תוקף: ${admin.expires_at})`;
                }
            }

            const textNode = document.createElement('span');
            textNode.textContent = `${admin.email} - ${statusText}`;
            li.appendChild(textNode);

            if (currentUserIsMainAdmin && admin.email.toLowerCase() !== currentUsername.toLowerCase()) {
                const removeBtn = document.createElement('button');
                removeBtn.textContent = 'הסר';
                removeBtn.dataset.adminEmail = admin.email;
                removeBtn.style.marginLeft = '10px';
                removeBtn.style.padding = '3px 8px';
                removeBtn.style.backgroundColor = '#f44336'; // Red
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '3px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', handleRemoveAdmin);
                li.appendChild(removeBtn);
            }
            ul.appendChild(li);
        });
        adminListContainer.appendChild(ul);
    }

    async function handleRemoveAdmin(event) {
        const emailToRemove = event.target.dataset.adminEmail;
        if (!emailToRemove) return;

        if (!confirm(`האם אתה בטוח שברצונך להסיר את המנהל ${emailToRemove}?`)) {
            return;
        }

        event.target.disabled = true;
        event.target.textContent = 'מסיר...';

        if (!currentUsername) { // Safeguard
             alert('שגיאה: לא זוהה משתמש נוכחי לשליחת הבקשה.');
             event.target.disabled = false;
             event.target.textContent = 'הסר';
             return;
        }
        const result = await apiService.removeSiteAdmin(emailToRemove, currentUsername);

        if (result.success) {
            alert(`המנהל ${emailToRemove} הוסר בהצלחה.`);
            await loadAndDisplayAdmins();
        } else {
            alert(`שגיאה בהסרת מנהל: ${result.error}`);
            event.target.disabled = false;
            event.target.textContent = 'הסר';
        }
    }

    function ensureBaseStyles() {
        const styleId = 'admin-panel-base-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .hidden { display: none !important; }
            .admin-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 600px;
                background-color: #fff; /* Default to white, will be overridden by :root vars if they exist */
                color: #333; /* Default text color */
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                z-index: 1000;
                padding: 15px;
                box-sizing: border-box;
            }
            /* Attempt to use variables if defined, otherwise use defaults */
            .admin-panel {
                 background-color: var(--background-primary, #fff);
                 color: var(--text-primary, #333);
                 border: 1px solid var(--border-color, #ddd);
            }
            .admin-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border-color, #ddd);
            }
            .admin-panel-header h2 { margin: 0; font-size: 1.4em; }
            .admin-panel-header .control-btn { background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--text-primary, #333); }

            #add-admin-form div { margin-bottom: 10px; }
            #add-admin-form label { display: inline-block; margin-bottom: 5px; }
            #add-admin-form input[type="email"],
            #add-admin-form input[type="number"] {
                width: calc(100% - 18px); /* Adjust for padding and border */
                padding: 8px;
                border: 1px solid var(--border-color, #ccc);
                border-radius: 4px;
                box-sizing: border-box;
            }
             #add-admin-form input[type="checkbox"] { margin-left: 5px; vertical-align: middle;}
            #add-admin-submit-btn { /* Uses .primary-button class styling if available */
                padding: 10px 15px;
                background-color: var(--primary-color, #007bff); /* Default blue */
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            #add-admin-submit-btn:disabled { background-color: #aaa; }
            hr { border: 0; border-top: 1px solid var(--border-secondary, #eee); margin: 20px 0; }
            #admin-list-container { max-height: 250px; overflow-y: auto; border: 1px solid var(--border-secondary, #eee); padding: 10px; border-radius: 4px; }
            .admin-list { list-style: none; padding: 0; margin:0; }
        `;
        document.head.appendChild(style);
    }

    ensureBaseStyles();
    getUsernameFromStorage(); // Start the process
});
