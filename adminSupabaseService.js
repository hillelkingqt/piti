// adminSupabaseService.js
const { createClient } = require('@supabase/supabase-js');
const config = require('./config'); // Assuming config.js is in the same directory (root)

// These would be loaded from environment variables in a real setup
// For the subtask environment, these might not be available,
// so the service should handle potential undefined values gracefully for now.
// const SUPABASE_URL = process.env.SUPABASE_URL;
// const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (config.SUPABASE_URL && config.SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' &&
    config.SUPABASE_SERVICE_ROLE_KEY && config.SUPABASE_SERVICE_ROLE_KEY !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE') {
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
} else {
    console.warn("Supabase URL or Service Role Key is not configured in config.js or still has placeholder values. Supabase client not initialized. Functions requiring Supabase will fail.");
    // Mock Supabase client for environments where it's not configured
    // This allows the rest of the code to be syntactically correct
    // and functions to exist, even if they won't work.
    supabase = {
        from: () => ({
            upsert: () => Promise.resolve({ error: { message: 'Supabase not configured in config.js' }, data: null }),
            delete: () => Promise.resolve({ error: { message: 'Supabase not configured in config.js' }, data: null }),
            select: () => Promise.resolve({ error: { message: 'Supabase not configured in config.js' }, data: null }),
            eq: () => ({
               maybeSingle: () => Promise.resolve({ error: { message: 'Supabase not configured in config.js' }, data: null })
            })
        })
    };
}

const MAIN_ADMIN_EMAILS = ['hillelben14', 'hagben']; // Main admin emails

function isMainAdmin(email) {
    return MAIN_ADMIN_EMAILS.includes(email);
}

async function addAdmin(email, isTemporary, expiresAtISO, addedByEmail) {
    if (!isMainAdmin(addedByEmail)) {
        return { error: 'Unauthorized: Only main admins can add new administrators.', data: null };
    }
    if (!email) {
        return { error: 'Email is required.', data: null };
    }
    if (!supabase || typeof supabase.from !== 'function') { // Check if supabase client is valid
         return { error: 'Supabase client not initialized.', data: null };
    }

    const adminData = {
        email: email.toLowerCase(),
        is_temporary: !!isTemporary,
        expires_at: isTemporary && expiresAtISO ? expiresAtISO : null,
        added_by: addedByEmail,
    };

    const { data, error } = await supabase
        .from('admin')
        .upsert(adminData, { onConflict: 'email' })
        .select();

    if (error) {
        console.error('Supabase addAdmin error:', error);
        return { error: `Supabase error: ${error.message}`, data: null };
    }
    return { data: data ? data[0] : null, error: null };
}

async function removeAdmin(emailToRemove, removedByEmail) {
    if (!isMainAdmin(removedByEmail)) {
        return { error: 'Unauthorized: Only main admins can remove administrators.', data: null };
    }
    if (!emailToRemove) {
        return { error: 'Email to remove is required.', data: null };
    }
    if (!supabase || typeof supabase.from !== 'function') {
         return { error: 'Supabase client not initialized.', data: null };
    }

    const { data, error } = await supabase
        .from('admin')
        .delete()
        .eq('email', emailToRemove.toLowerCase())
        .select();

    if (error) {
        console.error('Supabase removeAdmin error:', error);
        return { error: `Supabase error: ${error.message}`, data: null };
    }
    return { data: data ? data[0] : null, error: null };
}

async function listAdmins() {
    if (!supabase || typeof supabase.from !== 'function') {
         return { error: 'Supabase client not initialized.', data: null };
    }
    const { data, error } = await supabase
        .from('admin')
        .select('id, email, is_temporary, expires_at, added_by, created_at');

    if (error) {
        console.error('Supabase listAdmins error:', error);
        return { error: `Supabase error: ${error.message}`, data: null };
    }
    return { data, error: null };
}

async function getAdminByEmail(email) {
    if (!email) {
        return { error: 'Email is required.', data: null };
    }
    if (!supabase || typeof supabase.from !== 'function') {
         return { error: 'Supabase client not initialized.', data: null };
    }
    const { data, error } = await supabase
        .from('admin')
        .select('id, email, is_temporary, expires_at, added_by, created_at')
        .eq('email', email.toLowerCase())
        .maybeSingle();

    if (error) {
        console.error('Supabase getAdminByEmail error:', error);
        return { error: `Supabase error: ${error.message}`, data: null };
    }
    return { data, error: null };
}

module.exports = {
    addAdmin,
    removeAdmin,
    listAdmins,
    getAdminByEmail,
    isMainAdmin,
};
