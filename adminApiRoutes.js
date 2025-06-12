// adminApiRoutes.js
const express = require('express');
const router = express.Router();
// Assuming adminSupabaseService.js is in the same directory (root)
const adminService = require('./adminSupabaseService');

const MAIN_ADMIN_EMAILS = ['hillelben14', 'hagben'];

async function isMainAdminMiddleware(req, res, next) {
    const currentUserEmail = req.body.currentUserEmail || req.query.currentUserEmail;
    if (!currentUserEmail) {
        return res.status(400).json({ error: 'currentUserEmail is required for authorization.' });
    }
    if (!MAIN_ADMIN_EMAILS.includes(currentUserEmail.toLowerCase())) {
        return res.status(403).json({ error: 'Unauthorized: You do not have permission to perform this action.' });
    }
    req.currentUserEmail = currentUserEmail.toLowerCase();
    next();
}

router.post('/add', isMainAdminMiddleware, async (req, res) => {
    const { email, isTemporary, durationDays } = req.body;
    const addedByEmail = req.currentUserEmail;

    if (!email) {
        return res.status(400).json({ error: 'Admin email is required.' });
    }

    let expiresAtISO = null;
    if (isTemporary) {
        if (durationDays && Number.isInteger(parseInt(durationDays)) && parseInt(durationDays) > 0) {
            const expires = new Date();
            expires.setDate(expires.getDate() + parseInt(durationDays));
            expiresAtISO = expires.toISOString();
        } else {
            return res.status(400).json({ error: 'Valid durationDays (positive integer) is required for temporary admins.' });
        }
    }

    const { data, error } = await adminService.addAdmin(email, !!isTemporary, expiresAtISO, addedByEmail);
    if (error) {
        if (error.includes('Unauthorized') || error.includes('Only main admins')) {
            return res.status(403).json({ error });
        }
         if (error.includes('Supabase client not initialized')) {
            return res.status(503).json({ error: 'Supabase service not available.'});
        }
        return res.status(500).json({ error });
    }
    res.status(201).json({ message: 'Admin added successfully.', admin: data });
});

router.post('/remove', isMainAdminMiddleware, async (req, res) => {
    const { emailToRemove } = req.body;
    const removedByEmail = req.currentUserEmail;

    if (!emailToRemove) {
        return res.status(400).json({ error: 'emailToRemove is required.' });
    }

    const { data, error } = await adminService.removeAdmin(emailToRemove, removedByEmail);
    if (error) {
        if (error.includes('Unauthorized') || error.includes('Only main admins')) {
            return res.status(403).json({ error });
        }
        if (error.includes('Supabase client not initialized')) {
            return res.status(503).json({ error: 'Supabase service not available.'});
        }
        return res.status(500).json({ error });
    }
    if (!data && !error) {
        return res.status(404).json({ error: `Admin with email ${emailToRemove} not found or already removed.` });
    }
    res.status(200).json({ message: 'Admin removed successfully.', admin: data });
});

router.get('/list', async (req, res) => {
    const currentUserEmail = req.query.currentUserEmail;
    // If no specific user is provided for check, or if user is a main admin, try to list all.
    if (currentUserEmail && MAIN_ADMIN_EMAILS.includes(currentUserEmail.toLowerCase())) {
        const { data, error } = await adminService.listAdmins();
        if (error) {
            if (error.includes('Supabase client not initialized')) {
                 return res.status(503).json({ error: 'Supabase service not available.'});
            }
            return res.status(500).json({ error });
        }
        return res.status(200).json(data);
    } else if (currentUserEmail) { // Non-main admin, try to get their own status
         const { data: selfData, error: selfError } = await adminService.getAdminByEmail(currentUserEmail.toLowerCase());
         if (selfError) {
            if (selfError.includes('Supabase client not initialized')) {
                return res.status(503).json({ error: 'Supabase service not available.'});
            }
            return res.status(500).json({ error: selfError });
         }
         return res.status(200).json(selfData ? [selfData] : []); // Return array with self, or empty
    } else {
        // No user email provided, deny access to full list.
        return res.status(403).json({ error: 'Unauthorized to list all admins without identifying as a main admin.' });
    }
});

router.get('/check/:email', async (req, res) => {
    const emailToCheck = req.params.email;
    if (!emailToCheck) {
        return res.status(400).json({ error: 'Email parameter is required.' });
    }
    const { data, error } = await adminService.getAdminByEmail(emailToCheck.toLowerCase());
    if (error) {
        if (error.includes('Supabase client not initialized')) {
            return res.status(503).json({ error: 'Supabase service not available.'});
        }
        return res.status(500).json({ error });
    }
    if (data) {
        res.status(200).json({ isAdmin: true, adminDetails: data, isMainAdmin: MAIN_ADMIN_EMAILS.includes(data.email.toLowerCase()) });
    } else {
        res.status(200).json({ isAdmin: false, isMainAdmin: false });
    }
});

module.exports = router;
