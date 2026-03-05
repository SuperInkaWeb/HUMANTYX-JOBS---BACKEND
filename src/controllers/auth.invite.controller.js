const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../db");

// POST /auth/set-password
// body: { token, email, password }
exports.setPasswordFromInvite = async (req, res) => {
  const conn = await pool.connect();
  try {
    const { token, email, password } = req.body;

    const cleanEmail = (email || "").trim().toLowerCase();
    const pwd = (password || "").trim();

    if (!token) return res.status(400).json({ message: "token es requerido" });
    if (!cleanEmail) return res.status(400).json({ message: "email es requerido" });
    if (!pwd || pwd.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await conn.query("BEGIN");

    // buscar invitación válida (FOR UPDATE para bloquear)
    const inv = await conn.query(
      `SELECT id, email, role, expires_at, used_at
       FROM user_invites
       WHERE token_hash = $1 AND email = $2
       LIMIT 1
       FOR UPDATE`,
      [tokenHash, cleanEmail]
    );

    if (!inv.rows.length) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ message: "Invitación inválida" });
    }

    const invite = inv.rows[0];

    if (invite.used_at) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ message: "Esta invitación ya fue usada" });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ message: "La invitación expiró" });
    }

    if (!["RRHH", "ADMIN"].includes(invite.role)) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ message: "Rol de invitación inválido" });
    }

    // asegurar que no exista usuario ya (por si se creó en paralelo)
    const exists = await conn.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [cleanEmail]);
    if (exists.rows.length) {
      await conn.query("ROLLBACK");
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await bcrypt.hash(pwd, 10);

    // crear usuario con rol invitado
    const created = await conn.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [cleanEmail, passwordHash, invite.role]
    );

    // marcar invitación como usada
    await conn.query(`UPDATE user_invites SET used_at = now() WHERE id = $1`, [invite.id]);

    await conn.query("COMMIT");

    return res.status(201).json({
      message: "Cuenta activada correctamente",
      user: created.rows[0],
    });
  } catch (err) {
    await conn.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error activando cuenta" });
  } finally {
    conn.release();
  }
};

exports.validateInvite = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({ message: "Token y email requeridos" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const inv = await pool.query(
      `
      SELECT id, email, role, expires_at, used_at
      FROM user_invites
      WHERE token_hash = $1 AND email = $2
      LIMIT 1
      `,
      [tokenHash, email.toLowerCase()]
    );

    if (!inv.rows.length) {
      return res.status(404).json({ error: "TOKEN_INVALID" });
    }

    const invite = inv.rows[0];

    if (invite.used_at) {
      return res.status(409).json({ error: "INVITE_USED" });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: "INVITE_EXPIRED" });
    }

    return res.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error validando invitación" });
  }
};
