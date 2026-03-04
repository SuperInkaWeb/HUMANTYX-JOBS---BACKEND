const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendInviteEmail(to, inviteUrl, role) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Invitación a Humantyx Jobs",
    html: `
      <h2>Has sido invitado como ${role}</h2>
      <p>Haz clic en el botón para activar tu cuenta:</p>
      <a href="${inviteUrl}" 
         style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">
         Activar cuenta
      </a>
      <p>Este enlace expira en 48 horas.</p>
    `,
  });
}

module.exports = { sendInviteEmail };