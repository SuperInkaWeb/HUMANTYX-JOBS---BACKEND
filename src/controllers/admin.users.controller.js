const crypto = require("crypto");
const pool = require("../db");
const { sendInviteEmail } = require("../services/mailer");

// POST /admin/users/invite  (ADMIN)
// body: { email, role }  role: RRHH | ADMIN
exports.inviteUser = async (req, res) => {
  try {
    const inviterId = req.user.id;

    const { email, role } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanRole = (role || "").trim().toUpperCase();

    if (!cleanEmail) return res.status(400).json({ message: "email es requerido" });
    if (!["RRHH", "ADMIN"].includes(cleanRole)) {
      return res.status(400).json({ message: "role inválido (RRHH | ADMIN)" });
    }

    // Si ya existe usuario con ese email, no invites
    const existsUser = await pool.query(`SELECT id, role FROM users WHERE email = $1 LIMIT 1`, [cleanEmail]);
    if (existsUser.rows.length) {
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }

    // Revocar invitaciones previas activas (opcional pro)
    await pool.query(
      `UPDATE user_invites
       SET used_at = now()
       WHERE email = $1 AND used_at IS NULL AND expires_at > now()`,
      [cleanEmail]
    );

    // Token (solo se devuelve por API para que lo pegues en frontend o lo envíes por email)
    const token = crypto.randomBytes(32).toString("hex");

    // Hash del token (no guardamos token plano)
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Expira en 48h
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const ins = await pool.query(
      `INSERT INTO user_invites (email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, role, expires_at, created_at`,
      [cleanEmail, cleanRole, tokenHash, inviterId, expiresAt]
    );

    // Link de activación (frontend)
    const FRONT_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    const inviteUrl = `${FRONT_URL}/set-password?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    // Si ya tienes servicio de correo, aquí lo llamas (opcional)
    let mailSent = false;

    try {
      await sendInviteEmail(cleanEmail, inviteUrl, cleanRole);
      mailSent = true;
    } catch (mailErr) {
      console.error("Error enviando email:", mailErr);
      mailSent = false;
    }
    // await sendInviteEmail(cleanEmail, inviteUrl)

    return res.status(201).json({
      invite: ins.rows[0],
      mail_sent: mailSent,
      invite_url: inviteUrl, // fallback si falla email
      ...(process.env.NODE_ENV !== "production" && { token }), // solo en dev

    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando invitación" });
  }
};