const nodemailer = require('nodemailer');

let transport;

function mailAvailable() {
    return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM
        && Boolean(process.env.SMTP_USER) === Boolean(process.env.SMTP_PASSWORD));
}

function sendMail(message) {
    if (!mailAvailable()) throw new Error('SMTP is not configured.');
    const port = Number(process.env.SMTP_PORT || 587);
    transport ||= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined
    });
    return transport.sendMail({ ...message, from: process.env.MAIL_FROM });
}

module.exports = { mailAvailable, sendMail };
