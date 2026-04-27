const crypto = require("crypto");
const pool = require("../db");
const { sendInviteEmail } = require("../services/mailer");

const INVITE_EXPIRATION_HOURS = 48;
const RESEND_COOLDOWN_MINUTES = 5;

function buildInviteUrl(email, token) {
  const FRONT_URL = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${FRONT_URL}/set-password?token=${token}&email=${encodeURIComponent(email)}`;
}

function createInviteToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function createInviteExpirationDate() {
  return new Date(Date.now() + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000);
}

// POST /admin/users/invite  (ADMIN)
// body: { email, role }  role: RRHH | ADMIN
exports.inviteUser = async (req, res) => {
  try {
    const inviterId = req.user.id;

    const { email, role } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanRole = (role || "").trim().toUpperCase();

    if (!cleanEmail) {
      return res.status(400).json({ message: "email es requerido" });
    }

    if (!["RRHH", "ADMIN"].includes(cleanRole)) {
      return res.status(400).json({ message: "role inválido (RRHH | ADMIN)" });
    }

    // 1) Si ya existe usuario con ese email, no invitar
    const existsUser = await pool.query(
      `SELECT id, role, is_active FROM users WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existsUser.rows.length) {
      const existingUser = existsUser.rows[0];

      return res.status(409).json({
        message: existingUser.is_active
          ? `Ya existe una cuenta registrada con este correo (${existingUser.role}).`
          : `Ya existe una cuenta registrada con este correo (${existingUser.role}), pero está deshabilitada.`,
        code: "USER_ALREADY_EXISTS",
      });
    }

    // 2) Si ya existe una invitación pendiente, no crear otra
    const pendingInviteResult = await pool.query(
      `
      SELECT id, created_at, expires_at
      FROM user_invites
      WHERE email = $1
        AND used_at IS NULL
        AND cancelled_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (pendingInviteResult.rows.length) {
      return res.status(409).json({
        message: "Ya existe una invitación pendiente para este correo.",
        code: "PENDING_INVITE_EXISTS",
      });
    }

    // 3) Cooldown general de 5 minutos para cualquier nuevo envío a ese correo
    const recentInviteResult = await pool.query(
      `
      SELECT created_at
      FROM user_invites
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (recentInviteResult.rows.length) {
      const lastCreatedAt = new Date(recentInviteResult.rows[0].created_at).getTime();
      const now = Date.now();
      const diffMs = now - lastCreatedAt;
      const cooldownMs = RESEND_COOLDOWN_MINUTES * 60 * 1000;

      if (diffMs < cooldownMs) {
        return res.status(429).json({
          message: `Debes esperar ${RESEND_COOLDOWN_MINUTES} minutos antes de enviar otra invitación a este correo`,
          code: "INVITE_SEND_COOLDOWN",
        });
      }
    }

    const { token, tokenHash } = createInviteToken();
    const expiresAt = createInviteExpirationDate();

    const ins = await pool.query(
      `
      INSERT INTO user_invites (email, role, token_hash, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, role, expires_at, created_at
      `,
      [cleanEmail, cleanRole, tokenHash, inviterId, expiresAt]
    );

    const inviteUrl = buildInviteUrl(cleanEmail, token);

    let mailSent = false;
    let mailError = null;

    try {
      await sendInviteEmail(cleanEmail, inviteUrl, cleanRole);
      mailSent = true;
    } catch (mailErr) {
      console.error("Error enviando email:", mailErr);
      mailSent = false;
      mailError = mailErr.message || "No se pudo enviar el correo";
    }

    return res.status(201).json({
      invite: ins.rows[0],
      mail_sent: mailSent,
      mail_error: mailError,
      invite_url: inviteUrl,
      ...(process.env.NODE_ENV !== "production" && { token }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando invitación" });
  }
};

// GET /admin/users/user-invites
exports.listUserInvites = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        ui.id,
        ui.email,
        ui.role,
        ui.invited_by,
        inviter.email AS invited_by_email,
        ui.created_at,
        ui.expires_at,
        ui.used_at,
        ui.cancelled_at,
        CASE
          WHEN ui.cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN ui.used_at IS NOT NULL THEN 'USED'
          WHEN ui.expires_at < NOW() THEN 'EXPIRED'
          ELSE 'PENDING'
        END AS status
      FROM user_invites ui
      LEFT JOIN users inviter ON inviter.id = ui.invited_by
      ORDER BY ui.created_at DESC
      `
    );

    return res.json({
      invites: result.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando invitaciones" });
  }
};

// PATCH /admin/users/user-invites/:id/cancel
exports.cancelInvite = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE user_invites
      SET cancelled_at = NOW()
      WHERE id = $1
        AND used_at IS NULL
        AND cancelled_at IS NULL
        AND expires_at > NOW()
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        message: "Solo se pueden cancelar invitaciones pendientes",
      });
    }

    return res.json({ message: "Invitación cancelada correctamente" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error cancelando invitación" });
  }
};

// POST /admin/users/user-invites/:id/resend
exports.resendInvite = async (req, res) => {
  try {
    const inviterId = req.user.id;
    const { id } = req.params;

    const inviteResult = await pool.query(
      `
      SELECT
        ui.id,
        ui.email,
        ui.role,
        ui.created_at,
        ui.expires_at,
        ui.used_at,
        ui.cancelled_at,
        CASE
          WHEN ui.cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN ui.used_at IS NOT NULL THEN 'USED'
          WHEN ui.expires_at < NOW() THEN 'EXPIRED'
          ELSE 'PENDING'
        END AS status
      FROM user_invites ui
      WHERE ui.id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({ message: "Invitación no encontrada" });
    }

    const invite = inviteResult.rows[0];
    const cleanEmail = (invite.email || "").trim().toLowerCase();
    const cleanRole = (invite.role || "").trim().toUpperCase();

    // Solo se puede reenviar si la invitación ya expiró o fue cancelada
    if (!["EXPIRED", "CANCELLED"].includes(invite.status)) {
      return res.status(400).json({
        message: "Solo se pueden reenviar invitaciones expiradas o canceladas",
      });
    }

    // Si ya existe usuario con ese email, no reenviar
    const existsUser = await pool.query(
      `SELECT id, role, is_active FROM users WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existsUser.rows.length) {
      const existingUser = existsUser.rows[0];

      return res.status(409).json({
        message: existingUser.is_active
          ? `No se puede reenviar la invitación porque este correo ya tiene una cuenta creada (${existingUser.role}).`
          : `No se puede reenviar la invitación porque este correo ya tiene una cuenta creada (${existingUser.role}), aunque está deshabilitada.`,
        code: "USER_ALREADY_EXISTS",
      });
    }

    // Cooldown de 5 minutos
    const recentInviteResult = await pool.query(
      `
      SELECT created_at
      FROM user_invites
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (recentInviteResult.rows.length) {
      const lastCreatedAt = new Date(recentInviteResult.rows[0].created_at).getTime();
      const now = Date.now();
      const diffMs = now - lastCreatedAt;
      const cooldownMs = RESEND_COOLDOWN_MINUTES * 60 * 1000;

      if (diffMs < cooldownMs) {
        return res.status(429).json({
          message: `Debes esperar ${RESEND_COOLDOWN_MINUTES} minutos antes de reenviar otra invitación a este correo`,
          code: "INVITE_RESEND_COOLDOWN",
        });
      }
    }

    const { token, tokenHash } = createInviteToken();
    const expiresAt = createInviteExpirationDate();

    const ins = await pool.query(
      `
      INSERT INTO user_invites (email, role, token_hash, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, role, expires_at, created_at
      `,
      [cleanEmail, cleanRole, tokenHash, inviterId, expiresAt]
    );

    const inviteUrl = buildInviteUrl(cleanEmail, token);

    let mailSent = false;
    let mailError = null;

    try {
      await sendInviteEmail(cleanEmail, inviteUrl, cleanRole);
      mailSent = true;
    } catch (mailErr) {
      console.error("Error reenviando email:", mailErr);
      mailSent = false;
      mailError = mailErr.message || "No se pudo enviar el correo";
    }

    return res.status(201).json({
      message: "Invitación reenviada correctamente",
      invite: ins.rows[0],
      mail_sent: mailSent,
      mail_error: mailError,
      invite_url: inviteUrl,
      ...(process.env.NODE_ENV !== "production" && { token }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error reenviando invitación" });
  }
};

// GET /admin/users?role=RRHH
exports.listUsers = async (req, res) => {
  try {
    const role = String(req.query.role || "RRHH").trim().toUpperCase();

    if (!["RRHH", "ADMIN", "CANDIDATE"].includes(role)) {
      return res.status(400).json({ message: "role inválido" });
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.is_active,
        u.created_at
      FROM users u
      WHERE u.role = $1
      ORDER BY u.created_at DESC
      `,
      [role]
    );

    return res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// PATCH /admin/users/:id/status
// body: { is_active: true | false }
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body || {};
    const requesterId = req.user.id;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active debe ser boolean" });
    }

    const userResult = await pool.query(
      `
      SELECT id, email, role, is_active
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const targetUser = userResult.rows[0];

    if (targetUser.role !== "RRHH") {
      return res.status(403).json({
        message: "Solo se puede cambiar el estado de usuarios RRHH",
      });
    }

    if (targetUser.id === requesterId) {
      return res.status(400).json({
        message: "No puedes cambiar el estado de tu propia cuenta",
      });
    }

    const updated = await pool.query(
      `
      UPDATE users
      SET is_active = $2
      WHERE id = $1
      RETURNING id, email, role, is_active, created_at
      `,
      [id, is_active]
    );

    return res.json({
      message: is_active
        ? "Usuario habilitado correctamente"
        : "Usuario deshabilitado correctamente",
      user: updated.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error actualizando estado del usuario" });
  }
};