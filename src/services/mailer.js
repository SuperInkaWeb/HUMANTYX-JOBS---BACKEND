const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInviteEmail(to, inviteUrl, role) {
  await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: [to],
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