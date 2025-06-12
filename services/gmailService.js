const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { Buffer } = require('buffer'); // Node.js Buffer
// const config = require('../config'); // For paths if needed, but handled by chatPaths for attachments

/**
 * Sends an email using a pre-configured Gmail API client.
 *
 * @param {object} gmailClient - The authenticated google.gmail({ version: 'v1' }) client.
 * @param {object} emailData - Email details.
 * @param {string} emailData.to - Recipient's email address.
 * @param {string} emailData.subject - Email subject.
 * @param {string} emailData.html - HTML content of the email.
 * @param {string} [emailData.attachmentPath] - Optional absolute path to a file to attach.
 * @param {string} [emailData.attachmentMimeType] - Optional MIME type for the attachment (e.g., 'image/png').
 *                                                  If not provided, it will be looked up based on filename.
 * @returns {Promise<boolean>} True if email was sent successfully, false otherwise.
 */
async function sendEmail(gmailClient, emailData) {
    const { to, subject, html, attachmentPath } = emailData;

    if (!gmailClient || !to || !subject || !html) {
        console.error("[GmailService] Missing required parameters: gmailClient, to, subject, or html.");
        return false;
    }

    console.log(`[GmailService] Preparing email. To: ${to}, Subject: "${subject.substring(0, 50)}..."`);

    let rawEmail = '';
    const boundary = `boundary_gmail_${Date.now()}`;

    try {
        if (attachmentPath && fs.existsSync(attachmentPath)) {
            console.log(`[GmailService] Processing attachment: ${attachmentPath}`);
            const fileContent = fs.readFileSync(attachmentPath);
            const base64File = fileContent.toString('base64');
            const filename = path.basename(attachmentPath);
            const mimeType = emailData.attachmentMimeType || mime.lookup(filename) || 'application/octet-stream';

            console.log(`[GmailService] Attachment details - Filename: ${filename}, MimeType: ${mimeType}`);

            rawEmail = [
                `From: "Piti Bot" <piti-bot-auto@example.com>`, // Consider making sender configurable
                `To: ${to}`,
                `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
                `MIME-Version: 1.0`,
                `Content-Type: multipart/mixed; boundary="${boundary}"`,
                '',
                `--${boundary}`,
                `Content-Type: text/html; charset="UTF-8"`,
                `Content-Transfer-Encoding: base64`,
                '',
                Buffer.from(html).toString('base64'),
                '',
                `--${boundary}`,
                `Content-Type: ${mimeType}; name="${filename}"`,
                `Content-Disposition: attachment; filename="${filename}"`,
                `Content-Transfer-Encoding: base64`,
                '',
                base64File,
                '',
                `--${boundary}--`
            ].join('\r\n');
        } else {
            if (attachmentPath) {
                console.warn(`[GmailService] Attachment path specified (${attachmentPath}) but file not found.`);
            }
            console.log(`[GmailService] Preparing email without attachment.`);
            rawEmail = [
                `From: "Piti Bot" <piti-bot-auto@example.com>`,
                `To: ${to}`,
                `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset="UTF-8"`,
                `Content-Transfer-Encoding: base64`,
                '',
                Buffer.from(html).toString('base64')
            ].join('\r\n');
        }

        const encodedMessage = Buffer.from(rawEmail)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        console.log("[GmailService] Sending email via Gmail API...");
        await gmailClient.users.messages.send({
            userId: 'me', // 'me' indicates the authenticated user
            requestBody: { raw: encodedMessage },
        });
        console.log("[GmailService] Email sent successfully.");
        return true;

    } catch (err) {
        console.error("❌ [GmailService] Error sending email:", err.response?.data?.error || err.message || err);
        return false;
    }
}

module.exports = {
    sendEmail,
};
