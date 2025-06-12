const { google } = require('googleapis');
const GoogleAuthService = require('./GoogleAuthService');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Prepares and sends an email with optional attachments.
 * @param {string} to The recipient's email address.
 * @param {string} subject The subject of the email.
 * @param {string} body The body of the email.
 * @param {Array<Object>} attachments An array of attachment objects (e.g., from msg.downloadMedia()).
 *                                    Each object should have 'mimetype' and 'data' (base64).
 * @returns {Promise<Object>} An object indicating success or failure.
 */
async function prepareAndSendEmail(to, subject, body, attachments = []) {
    try {
        const oAuth2Client = await GoogleAuthService.getGoogleAuthClient();
        if (!oAuth2Client) {
            return { success: false, error: 'Failed to get Google Auth client.' };
        }
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

        let emailLines = [];
        emailLines.push(`To: ${to}`);
        emailLines.push(`Subject: ${subject}`);
        emailLines.push('Content-Type: multipart/mixed; boundary="boundary_example"');
        emailLines.push('');
        emailLines.push('--boundary_example');
        emailLines.push('Content-Type: text/plain; charset="UTF-8"');
        emailLines.push('');
        emailLines.push(body);

        if (attachments && attachments.length > 0) {
            for (const attachment of attachments) {
                if (attachment && attachment.data) {
                    emailLines.push('--boundary_example');
                    emailLines.push(`Content-Type: ${attachment.mimetype}`);
                    emailLines.push('Content-Transfer-Encoding: base64');

                    // Extract filename from attachment if available, or generate one
                    let filename = attachment.filename || `attachment_${Date.now()}`;
                    // Ensure filename has an extension if possible
                    if (attachment.mimetype && !path.extname(filename)) {
                        const extension = attachment.mimetype.split('/')[1];
                        if (extension) {
                            filename += `.${extension}`;
                        }
                    }
                    emailLines.push(`Content-Disposition: attachment; filename="${filename}"`);
                    emailLines.push('');
                    emailLines.push(attachment.data); // Assuming attachment.data is already base64
                }
            }
        }

        emailLines.push('--boundary_example--');

        const email = emailLines.join('\r\n');
        const rawEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawEmail,
            },
        });
        console.log('Email sent successfully:', result.data);
        return { success: true, messageId: result.data.id };
    } catch (error) {
        console.error('Error sending email:', error);
        // Try to get more specific error from Google API response
        const googleError = error.response?.data?.error || error.message;
        return { success: false, error: `Failed to send email: ${googleError}` };
    }
}


/**
 * Sends a pre-formatted raw email.
 * @param {string} rawEmail The raw email content, base64url encoded.
 * @returns {Promise<Object>} An object indicating success or failure.
 */
async function sendGmail(rawEmail) {
    try {
        const oAuth2Client = await GoogleAuthService.getGoogleAuthClient();
        if (!oAuth2Client) {
            return { success: false, error: 'Failed to get Google Auth client.' };
        }
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawEmail,
            },
        });
        return { success: true, messageId: result.data.id };
    } catch (error) {
        console.error('Error sending email via sendGmail:', error);
        const googleError = error.response?.data?.error || error.message;
        return { success: false, error: `Failed to send email: ${googleError}` };
    }
}

module.exports = {
    prepareAndSendEmail,
    sendGmail,
};
