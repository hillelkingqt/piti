// --- START OF FILE hahah.js ---

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { PDFDocument } = require('pdf-lib');
const mime = require('mime-types');

// --- Configuration ---
const TOKEN_PATH = path.join(__dirname, 'token.json');
// IMPORTANT: Update this path if your client secret file name is different
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com.json');
const TEMP_PDF_DIR = path.join(__dirname, 'temp_pdfs'); // Directory to store downloaded PDFs temporarily
const MERGED_PDF_PATH = path.join(__dirname, 'merged_pdfs.pdf'); // Path for the final merged PDF
const TARGET_EMAIL = 'hillelben14@gmail.com'; // Email address to send the merged PDF to
const MAX_EMAILS_TO_CHECK = 100; // How many recent emails to check
const KEYWORD_TO_SEARCH = 'חשבונית'; // מילת המפתח לחיפוש במייל (בנוסף ל-PDF)

// --- Authentication Functions (Reused) ---

function loadCredentials() {
    try {
        const content = fs.readFileSync(CREDENTIALS_PATH);
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ Error loading credentials from ${CREDENTIALS_PATH}:`, err);
        throw new Error(`Could not load credentials file. Make sure it exists at ${CREDENTIALS_PATH}`);
    }
}

function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    } catch (err) {
        console.error(`❌ Error loading token from ${TOKEN_PATH}:`, err);
        console.error('💡 Please ensure you have run the authentication flow first to generate token.json.');
        throw new Error('Failed to load authorization token.');
    }
}

// --- Gmail API Interaction Functions ---

/**
 * Lists the IDs of the most recent emails.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {google.gmail_v1.Gmail} gmail Gmail API client.
 * @returns {Promise<string[]>} A promise that resolves with an array of message IDs.
 */
async function listRecentEmails(auth, gmail) {
    console.log(`🔍 Fetching the last ${MAX_EMAILS_TO_CHECK} email IDs...`);
    try {
        // Note: We don't filter by 'has:attachment' here anymore,
        // because we need to check the email content first for the keyword.
        const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: MAX_EMAILS_TO_CHECK,
        });
        const messages = res.data.messages;
        if (!messages || messages.length === 0) {
            console.log('ℹ️ No messages found.');
            return [];
        }
        console.log(`📊 Found ${messages.length} email IDs to check.`);
        return messages.map(message => message?.id);
    } catch (err) {
        console.error('❌ Error listing emails:', err);
        throw err; // Re-throw to be caught by main handler
    }
}

/**
 * Decodes base64 data (handling URL-safe variants) to UTF-8 string.
 * @param {string} data Base64 encoded string.
 * @returns {string} Decoded string.
 */
function decodeBase64(data) {
    if (!data) return '';
    try {
        return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    } catch (e) {
        console.warn("⚠️ Failed to decode base64 string:", e.message);
        return ''; // Return empty string on decoding error
    }
}

/**
 * Recursively extracts text content (plain and html) from email payload parts.
 * @param {object} payload The message payload or a part of it.
 * @returns {string} Combined text content.
 */
function getEmailTextContent(payload) {
    let content = '';
    const mimeType = payload.mimeType || '';

    // Check current part/payload body
    if ((mimeType.startsWith('text/plain') || mimeType.startsWith('text/html')) && payload.body && payload.body.data) {
        content += decodeBase64(payload.body.data) + '\n';
    }

    // Recursively check nested parts
    if (payload.parts && payload.parts.length > 0) {
        for (const part of payload.parts) {
            content += getEmailTextContent(part); // Recursively add content from sub-parts
        }
    }
    return content;
}

/**
 * Searches for a keyword within the email's subject and body content.
 * @param {object} payload The message payload.
 * @param {string} keyword The keyword to search for (case-insensitive).
 * @returns {boolean} True if the keyword is found, false otherwise.
 */
function searchKeywordInEmail(payload, keyword) {
    if (!payload) return false;

    // 1. Check Subject Header
    const subjectHeader = payload.headers?.find(h => h.name?.toLowerCase() === 'subject');
    const subject = subjectHeader?.value || '';

    // 2. Get Body Content (plain text and HTML combined)
    const bodyContent = getEmailTextContent(payload);

    // 3. Combine subject and body for searching
    const fullText = (subject + '\n' + bodyContent).toLowerCase(); // Case-insensitive search
    const keywordLower = keyword.toLowerCase();

    return fullText.includes(keywordLower);
}


/**
 * Finds PDF attachment IDs within a message payload structure.
 * @param {object} payload The message payload.
 * @returns {Array<{id: string, filename: string}>} Array of attachment IDs and filenames.
 */
function findPdfAttachments(payload) {
    let pdfAttachments = [];
    const parts = payload.parts || [];

    for (const part of parts) {
        // Check if the part itself is a PDF attachment
        if (part.mimeType === 'application/pdf' && part.body && part.body.attachmentId && part.filename) {
             pdfAttachments.push({
                id: part.body.attachmentId,
                filename: part.filename // Use filename if available
            });
        }
        // Recursively check nested parts (important for multipart/related or multipart/mixed)
        if (part.parts) {
            pdfAttachments = pdfAttachments.concat(findPdfAttachments(part));
        }
    }
    return pdfAttachments;
}

/**
 * Gets message details, checks for the keyword, and THEN extracts PDF attachment info if keyword is found.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {google.gmail_v1.Gmail} gmail Gmail API client.
 * @param {string} messageId The ID of the message to get.
 * @param {string} keyword The keyword to search for.
 * @returns {Promise<Array<{messageId: string, attachmentId: string, filename: string}>>} PDF attachment details if keyword found, else empty array.
 */
async function getPdfAttachmentsFromEmail(auth, gmail, messageId, keyword) {
    try {
        // console.log(`  🔎 Checking email ${messageId} for keyword "${keyword}" and PDFs...`);
        const res = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full' // Need full format for content search and attachment IDs
        });

        const payload = res.data.payload;
        if (!payload) {
            // console.log(`  🤷 No payload found for message ${messageId}. Skipping.`);
            return []; // No payload
        }

        // *** KEYWORD CHECK FIRST ***
        const keywordFound = searchKeywordInEmail(payload, keyword);

        if (!keywordFound) {
            // console.log(`  ⏭️ Skipping email ${messageId}: Keyword "${keyword}" not found.`);
            return []; // Keyword not found, don't look for attachments
        }

        // Keyword found, now look for PDF attachments
        // console.log(`  👍 Keyword "${keyword}" found in email ${messageId}. Searching for PDFs...`);
        const attachments = findPdfAttachments(payload);

        if (attachments.length > 0) {
            console.log(`    📎 Found ${attachments.length} PDF attachment(s) in email ${messageId} (which also contains "${keyword}").`);
            return attachments.map(att => ({
                messageId: messageId,
                attachmentId: att?.id,
                filename: att.filename
            }));
        } else {
            // console.log(`    ℹ️ Keyword "${keyword}" found, but no PDF attachments in email ${messageId}.`);
            return []; // Keyword found, but no PDFs
        }

    } catch (err) {
        console.error(`❌ Error getting details for message ${messageId}:`, err.message);
        return []; // Return empty array on error for this specific email
    }
}

/**
 * Downloads a specific attachment and saves it to a temporary directory.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {google.gmail_v1.Gmail} gmail Gmail API client.
 * @param {string} messageId The ID of the message containing the attachment.
 * @param {string} attachmentId The ID of the attachment to download.
 * @param {string} originalFilename The original filename of the attachment.
 * @returns {Promise<string|null>} The path to the downloaded file, or null on error.
 */
async function downloadAttachment(auth, gmail, messageId, attachmentId, originalFilename) {
    console.log(`    📥 Downloading attachment ${attachmentId} ('${originalFilename}') from message ${messageId}...`);
    try {
        const res = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: attachmentId,
        });

        const base64Data = res.data.data;
        if (!base64Data) {
            console.warn(`    ⚠️ No data found for attachment ${attachmentId} in message ${messageId}.`);
            return null;
        }

        // Decode base64 data
        const fileData = Buffer.from(base64Data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        // Create a safe and unique filename
        const rawName = originalFilename.replace(/[^a-z0-9._-]/gi, '_'); // Clean invalid chars
        const shortName = rawName.length > 80 ? rawName.slice(0, 80) : rawName; // Shorten long names
        const idSegment = attachmentId.substring(0, 8); // Use part of attachment ID for uniqueness
        const safeFilename = `${messageId}_${idSegment}_${shortName}`;
        const filePath = path.join(TEMP_PDF_DIR, safeFilename);

        // Ensure temp directory exists
        if (!fs.existsSync(TEMP_PDF_DIR)) {
            fs.mkdirSync(TEMP_PDF_DIR, { recursive: true });
            console.log(`      📂 Created temporary directory: ${TEMP_PDF_DIR}`);
        }

        // Write the file
        fs.writeFileSync(filePath, fileData);
        console.log(`      ✅ Attachment saved to: ${filePath}`);
        return filePath;
    } catch (err) {
        // Add more specific error logging if possible
        const errorMessage = err.response?.data?.error?.message || err.message || 'Unknown error';
        console.error(`    ❌ Error downloading attachment ${attachmentId} from message ${messageId}: ${errorMessage}`);
        if (err.response?.status) {
            console.error(`      -> Status code: ${err.response.status}`);
        }
        return null; // Return null if download fails
    }
}

// --- PDF Merging Function ---

/**
 * Merges multiple PDF files into a single PDF.
 * @param {string[]} pdfPaths An array of paths to the PDF files to merge.
 * @param {string} outputPath The path where the merged PDF should be saved.
 */
async function mergePdfs(pdfPaths, outputPath) {
    if (pdfPaths.length === 0) {
        console.log('ℹ️ No PDF files to merge.');
        return false; // Indicate nothing was merged
    }
    console.log(`\n🔄 Merging ${pdfPaths.length} downloaded PDF files into ${outputPath}...`);
    try {
        const mergedPdf = await PDFDocument.create();
        let successfulPages = 0;

        for (const pdfPath of pdfPaths) {
            try {
                const pdfBytes = fs.readFileSync(pdfPath);
                const pdfDoc = await PDFDocument.load(pdfBytes, {
                    // Ignore encryption errors if necessary
                    ignoreEncryption: true
                });
                const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
                successfulPages += copiedPages.length;
                console.log(`   + Added ${copiedPages.length} page(s) from: ${path.basename(pdfPath)}`);
            } catch (loadErr) {
                console.warn(`  ⚠️ Skipping file ${path.basename(pdfPath)} due to loading error: ${loadErr.message}`);
            }
        }

        if (mergedPdf.getPageCount() === 0) {
             console.warn('⚠️ Merged PDF has 0 pages. No valid PDFs could be added.');
             return false;
        }

        const mergedPdfBytes = await mergedPdf.save();
        fs.writeFileSync(outputPath, mergedPdfBytes);
        console.log(`✅ Merged PDF with ${mergedPdf.getPageCount()} pages saved successfully: ${outputPath}`);
        return true; // Indicate merging was successful
    } catch (err) {
        console.error('❌ Error merging PDFs:', err);
        throw err; // Re-throw to be caught by main handler
    }
}

// --- Email Sending Function ---

/**
 * Creates and sends an email with the merged PDF attached.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {google.gmail_v1.Gmail} gmail Gmail API client.
 * @param {string} recipient The email address of the recipient.
 * @param {string} subject The subject of the email.
 * @param {string} bodyText The text content of the email body.
 * @param {string} attachmentPath The path to the file to attach.
 */
async function sendMergedPdf(auth, gmail, recipient, subject, bodyText, attachmentPath) {
    console.log(`\n📧 Preparing to send merged PDF to ${recipient}...`);
    try {
        if (!fs.existsSync(attachmentPath)) {
            console.error(`❌ Cannot send email: Merged PDF file not found at ${attachmentPath}`);
            return; // Stop if the file doesn't exist
        }
        const fileContent = fs.readFileSync(attachmentPath);
        const filename = path.basename(attachmentPath);
        const contentType = mime.lookup(filename) || 'application/pdf';

        const emailLines = [
            `To: ${recipient}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, // UTF-8 Subject
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="boundary_invoice_merger"`, // Unique boundary
            '',
            '--boundary_invoice_merger',
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: 7bit',
            '',
            bodyText,
            '',
            '--boundary_invoice_merger',
            `Content-Type: ${contentType}; name="${filename}"`,
            `Content-Disposition: attachment; filename="${filename}"`,
            'Content-Transfer-Encoding: base64',
            '',
            fileContent.toString('base64'),
            '',
            '--boundary_invoice_merger--'
        ];

        const email = emailLines.join('\r\n');

        // Base64Url encode the entire raw email
        const encodedEmail = Buffer.from(email)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail,
            },
        });

        console.log('✅ Email with merged PDF sent successfully! Message ID:', res.data?.id);
    } catch (err) {
        const errorMessage = err.response?.data || err.message || err;
        console.error('❌ Error sending email with attachment:', errorMessage);
        throw err; // Re-throw to be caught by main handler
    }
}

// --- Cleanup Function ---
function cleanupTempFiles(downloadedPaths) {
    console.log('\n🧹 Cleaning up temporary files...');
    let deletedCount = 0;
    downloadedPaths.forEach(filePath => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedCount++;
                // console.log(`   - Deleted: ${path.basename(filePath)}`);
            }
        } catch (err) {
            console.warn(`  ⚠️ Could not delete temporary file ${path.basename(filePath)}: ${err.message}`);
        }
    });
    if (deletedCount > 0) {
        console.log(`   - Deleted ${deletedCount} temporary PDF file(s).`);
    } else {
         console.log(`   - No temporary PDF files needed deletion.`);
    }

    try {
        // Attempt to remove the temp directory if it's empty
        if (fs.existsSync(TEMP_PDF_DIR)) {
            const files = fs.readdirSync(TEMP_PDF_DIR);
            if (files.length === 0) {
                fs.rmdirSync(TEMP_PDF_DIR);
                console.log(`   - Deleted empty temporary directory: ${TEMP_PDF_DIR}`);
            } else {
                 console.log(`   - Temporary directory ${TEMP_PDF_DIR} is not empty, leaving it.`);
            }
        }
        // Delete the merged PDF
        if (fs.existsSync(MERGED_PDF_PATH)) {
             fs.unlinkSync(MERGED_PDF_PATH);
             console.log(`   - Deleted merged PDF: ${MERGED_PDF_PATH}`);
        }
    } catch (err) {
        console.warn(`  ⚠️ Error during final directory/merged file cleanup: ${err.message}`);
    }
    console.log('✨ Cleanup finished.');
}


// --- Main Execution ---
async function main() {
    let downloadedPdfPaths = []; // Keep track of files to clean up
    console.log(`🚀 Starting PDF Merger Script for keyword "${KEYWORD_TO_SEARCH}"...`);
    const startTime = Date.now();

    try {
        // 1. Authorize
        console.log("\n--- 1. Authentication ---");
        const credentials = loadCredentials();
        const auth = authorize(credentials);
        const gmail = google.gmail({ version: 'v1', auth });
        console.log('🔑 Authentication successful.');

        // 2. List Email IDs
        console.log("\n--- 2. Fetching Email IDs ---");
        const messageIds = await listRecentEmails(auth, gmail);
        if (messageIds.length === 0) {
            console.log('🏁 No recent emails found to process. Exiting.');
            return;
        }

        // 3. Find Emails with Keyword AND PDF Attachments
        console.log(`\n--- 3. Searching Emails for Keyword "${KEYWORD_TO_SEARCH}" and PDFs ---`);
        let allPdfAttachmentsToDownload = [];
        let emailsChecked = 0;
        let emailsMatched = 0;
        for (const messageId of messageIds) {
            emailsChecked++;
            // Pass the keyword to the checking function
            const attachments = await getPdfAttachmentsFromEmail(auth, gmail, messageId, KEYWORD_TO_SEARCH);
            if (attachments.length > 0) {
                emailsMatched++;
                allPdfAttachmentsToDownload = allPdfAttachmentsToDownload.concat(attachments);
            }
            // Optional: Add a small delay to avoid hitting API limits too quickly if needed
            // await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log(`📊 Checked ${emailsChecked} emails. Found ${emailsMatched} emails matching the criteria (Keyword + PDF).`);


        if (allPdfAttachmentsToDownload.length === 0) {
            console.log(`ℹ️ No PDF attachments found in emails containing the keyword "${KEYWORD_TO_SEARCH}". Exiting.`);
            return;
        }

        // 4. Download the Found PDF Attachments
        console.log(`\n--- 4. Downloading ${allPdfAttachmentsToDownload.length} Relevant PDF Attachments ---`);
        for (const att of allPdfAttachmentsToDownload) {
            const downloadedPath = await downloadAttachment(auth, gmail, att.messageId, att.attachmentId, att.filename);
            if (downloadedPath) {
                downloadedPdfPaths.push(downloadedPath);
            }
        }

        if (downloadedPdfPaths.length === 0) {
            console.log('ℹ️ No PDF attachments could be successfully downloaded, even though they were found. Exiting.');
            return; // Exit if no files were actually saved
        }
        console.log(`✅ Successfully downloaded ${downloadedPdfPaths.length} PDF files.`);

        // 5. Merge Downloaded PDFs
        console.log("\n--- 5. Merging Downloaded PDFs ---");
        const merged = await mergePdfs(downloadedPdfPaths, MERGED_PDF_PATH);

        if (!merged) {
             console.log('ℹ️ PDF merging did not produce a file or failed. Exiting.');
             // Cleanup will still run in finally block
             return;
        }

        // 6. Send the Merged PDF
        console.log("\n--- 6. Sending Merged PDF ---");
        const subject = `חשבוניות מאוחדות (${new Date().toLocaleDateString('he-IL')}) - מילת מפתח: ${KEYWORD_TO_SEARCH}`;
        const body = `שלום,\n\nמצורפים ${downloadedPdfPaths.length} קבצי PDF שנמצאו במיילים אחרונים המכילים את המילה "${KEYWORD_TO_SEARCH}", אוחדו למסמך אחד.\n\nנוצר אוטומטית.`;
        await sendMergedPdf(
            auth,
            gmail,
            TARGET_EMAIL,
            subject,
            body,
            MERGED_PDF_PATH
        );

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`\n🎉 Process completed successfully in ${duration} seconds!`);

    } catch (error) {
        console.error('\n💥 An error occurred during the process:', error.message || error);
        if (error.stack) {
            // console.error(error.stack); // Uncomment for more detailed stack trace
        }
        // Process might have partially completed, cleanup is important
    } finally {
        // 7. Cleanup Temporary Files
        console.log("\n--- 7. Cleanup ---");
        cleanupTempFiles(downloadedPdfPaths); // Pass the list of successfully downloaded files
    }
}

// Run the main function
main().catch(err => {
    // This final catch might be redundant if errors are handled in main, but good practice
    console.error("🚨 Unhandled error in main execution scope:", err);
    // Consider cleaning up again here just in case finally didn't run or errored itself
    // cleanupTempFiles([]); // Attempt cleanup even on crash
});

// --- END OF FILE hahah.js ---