const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInviteEmail(to, inviteUrl, role) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY no está configurada");
  }

  if (!process.env.MAIL_FROM) {
    throw new Error("MAIL_FROM no está configurado");
  }

  const result = await resend.emails.send({
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

  console.log("Respuesta de Resend:", result);

  if (result?.error) {
    throw new Error(result.error.message || "Resend devolvió un error");
  }

  return result;
}

module.exports = { sendInviteEmail };