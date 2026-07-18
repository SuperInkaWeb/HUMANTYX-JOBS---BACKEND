const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../services/mailer");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeDocumentType(documentType) {
  const map = {
    // Perú
    PE_DNI: "DNI",
    PE_CE: "CE",
    PE_PASSPORT: "PASSPORT",
    PE_PTP: "PTP",
    PE_RUC: "RUC",

    // Ecuador
    EC_CI: "DNI",
    EC_PASSPORT: "PASSPORT",

    // Compatibilidad
    DNI: "DNI",
    CE: "CE",
    PASSPORT: "PASSPORT",
    PTP: "PTP",
    RUC: "RUC",
    OTHER: "OTHER",
  };

  return map[documentType] || documentType;
}

/* =========================
   REGISTER
========================= */
exports.register = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: "Email y password requeridos" });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [cleanEmail]
    );

    if (exists.rows.length) {
      return res.status(409).json({ message: "Email ya registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, role, is_active, created_at
      `,
      [cleanEmail, passwordHash]
    );

    const user = userResult.rows[0];

    await pool.query(
      `
      INSERT INTO user_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id]
    );

    await pool.query(
      `
      INSERT INTO candidate_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id]
    );

    const token = signToken({ id: user.id, role: user.role });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en register" });
  }
};

/* =========================
   LOGIN
========================= */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email y password requeridos" });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT id, email, password_hash, role, is_active
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        message: "Tu cuenta está deshabilitada. Contacta al administrador.",
        code: "USER_DISABLED",
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = signToken({ id: user.id, role: user.role });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en login" });
  }
};

/* =========================
   GET /auth/me
========================= */
exports.me = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.email,
        u.role,
        u.is_active,
        u.created_at,

        up.first_name,
        up.last_name,
        up.phone,
        up.document_type,
        up.document_number,
        up.country,
        up.department,
        up.city,
        up.district,
        up.address_line,
        up.postal_code,
        up.birth_date,
        up.gender,
        up.marital_status,
        up.updated_at AS profile_updated_at,

        cp.headline,
        cp.about,
        cp.linkedin_url,
        cp.portfolio_url,
        cp.education_level,
        cp.experience_years,
        cp.desired_salary,
        cp.availability,
        cp.profile_completed_at,
        cp.updated_at AS candidate_profile_updated_at,

        CASE
          WHEN u.role = 'CANDIDATE'
           AND up.first_name IS NOT NULL
           AND up.last_name IS NOT NULL
           AND up.phone IS NOT NULL
           AND up.document_type IS NOT NULL
           AND up.document_number IS NOT NULL
           AND up.country IS NOT NULL
           AND up.department IS NOT NULL
           AND up.city IS NOT NULL
           AND up.birth_date IS NOT NULL
           AND up.gender IS NOT NULL
           AND up.marital_status IS NOT NULL
          THEN true
          WHEN u.role <> 'CANDIDATE' THEN true
          ELSE false
        END AS profile_complete
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = result.rows[0];
    const isCandidate = user.role === "CANDIDATE";

    let academicRows = [];
    let workRows = [];

    if (isCandidate) {
      const academicRes = await pool.query(
        `
        SELECT
          id,
          education_level,
          institution,
          career,
          academic_status,
          start_date,
          end_date,
          location,
          total_years,
          created_at,
          updated_at
        FROM candidate_academic_items
        WHERE user_id = $1
        ORDER BY created_at ASC
        `,
        [userId]
      );

      const workRes = await pool.query(
        `
        SELECT
          id,
          position,
          company,
          start_date,
          end_date,
          location,
          total_years,
          description,
          created_at,
          updated_at
        FROM candidate_work_items
        WHERE user_id = $1
        ORDER BY created_at ASC
        `,
        [userId]
      );

      academicRows = academicRes.rows;
      workRows = workRes.rows;
    }

    return res.json({
      user: {
        ...user,
        academic_items: academicRows,
        work_items: workRows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en /me" });
  }
};

/* =========================
   PUT /auth/me/profile
========================= */
exports.updateMyProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;

    const userRes = await client.query(
      `
      SELECT id, role
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const currentUser = userRes.rows[0];
    const isCandidate = currentUser.role === "CANDIDATE";

    const {
      first_name,
      last_name,
      phone,
      document_type,
      document_number,
      country,
      department,
      city,
      district,
      address_line,
      postal_code,
      birth_date,
      gender,
      marital_status,

      headline,
      about,
      linkedin_url,
      portfolio_url,
      education_level,
      experience_years,
      desired_salary,
      availability,

      academic_items,
      work_items,
    } = req.body || {};
    const documentTypeToSave = normalizeDocumentType(document_type);

    const hasGeneralFields =
      first_name !== undefined ||
      last_name !== undefined ||
      phone !== undefined ||
      document_type !== undefined ||
      document_number !== undefined ||
      country !== undefined ||
      department !== undefined ||
      city !== undefined ||
      district !== undefined ||
      address_line !== undefined ||
      postal_code !== undefined ||
      birth_date !== undefined ||
      gender !== undefined ||
      marital_status !== undefined;

    const hasCandidateFields =
      headline !== undefined ||
      about !== undefined ||
      linkedin_url !== undefined ||
      portfolio_url !== undefined ||
      education_level !== undefined ||
      experience_years !== undefined ||
      desired_salary !== undefined ||
      availability !== undefined ||
      academic_items !== undefined ||
      work_items !== undefined;

    if (!hasGeneralFields && !hasCandidateFields) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO user_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    const generalRes = await client.query(
      `
      UPDATE user_profiles
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          document_type = COALESCE($4, document_type),
          document_number = COALESCE($5, document_number),
          country = COALESCE($6, country),
          department = COALESCE($7, department),
          city = COALESCE($8, city),
          district = COALESCE($9, district),
          address_line = COALESCE($10, address_line),
          postal_code = COALESCE($11, postal_code),
          birth_date = COALESCE($12, birth_date),
          gender = COALESCE($13, gender),
          marital_status = COALESCE($14, marital_status),
          updated_at = NOW()
      WHERE user_id = $15
      RETURNING *
      `,
      [
  first_name ?? null,
  last_name ?? null,
  phone ?? null,
  documentTypeToSave ?? null,
  document_number ?? null,
  country ?? null,
  department ?? null,
  city ?? null,
  district ?? null,
  address_line ?? null,
  postal_code ?? null,
  birth_date ?? null,
  gender ?? null,
  marital_status ?? null,
  userId,
]
    );

    let candidateProfile = null;

    if (isCandidate) {
      await client.query(
        `
        INSERT INTO candidate_profiles (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId]
      );

      const candidateRes = await client.query(
        `
        UPDATE candidate_profiles
        SET headline = COALESCE($1, headline),
            about = COALESCE($2, about),
            linkedin_url = COALESCE($3, linkedin_url),
            portfolio_url = COALESCE($4, portfolio_url),
            education_level = COALESCE($5, education_level),
            experience_years = COALESCE($6, experience_years),
            desired_salary = COALESCE($7, desired_salary),
            availability = COALESCE($8, availability),
            updated_at = NOW()
        WHERE user_id = $9
        RETURNING *
        `,
        [
          headline ?? null,
          about ?? null,
          linkedin_url ?? null,
          portfolio_url ?? null,
          education_level ?? null,
          experience_years ?? null,
          desired_salary ?? null,
          availability ?? null,
          userId,
        ]
      );

      candidateProfile = candidateRes.rows[0];

      if (academic_items !== undefined) {
        await client.query(
          `DELETE FROM candidate_academic_items WHERE user_id = $1`,
          [userId]
        );

        for (const item of academic_items || []) {
          await client.query(
            `
            INSERT INTO candidate_academic_items (
              user_id,
              education_level,
              institution,
              career,
              academic_status,
              start_date,
              end_date,
              location,
              total_years,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
            `,
            [
              userId,
              item.education_level ?? null,
              item.institution ?? null,
              item.career ?? null,
              item.academic_status ?? null,
              item.start_date ?? null,
              item.end_date ?? null,
              item.location ?? null,
              item.total_years ?? null,
            ]
          );
        }
      }

      if (work_items !== undefined) {
        await client.query(
          `DELETE FROM candidate_work_items WHERE user_id = $1`,
          [userId]
        );

        for (const item of work_items || []) {
          await client.query(
            `
            INSERT INTO candidate_work_items (
              user_id,
              position,
              company,
              start_date,
              end_date,
              location,
              total_years,
              description,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            `,
            [
              userId,
              item.position ?? null,
              item.company ?? null,
              item.start_date ?? null,
              item.end_date ?? null,
              item.location ?? null,
              item.total_years ?? null,
              item.description ?? null,
            ]
          );
        }
      }

      const profile = generalRes.rows[0];

      const isComplete =
        profile.first_name &&
        profile.last_name &&
        profile.phone &&
        profile.document_type &&
        profile.document_number &&
        profile.country &&
        profile.department &&
        profile.city &&
        profile.birth_date &&
        profile.gender &&
        profile.marital_status;

      if (isComplete && !candidateProfile?.profile_completed_at) {
        await client.query(
          `
          UPDATE candidate_profiles
          SET profile_completed_at = NOW()
          WHERE user_id = $1
          `,
          [userId]
        );

        const refreshCandidate = await client.query(
          `
          SELECT *
          FROM candidate_profiles
          WHERE user_id = $1
          LIMIT 1
          `,
          [userId]
        );

        candidateProfile = refreshCandidate.rows[0];
      }
    }

    let academicRows = [];
    let workRows = [];

    if (isCandidate) {
      const academicRes = await client.query(
        `
        SELECT
          id,
          education_level,
          institution,
          career,
          academic_status,
          start_date,
          end_date,
          location,
          total_years,
          created_at,
          updated_at
        FROM candidate_academic_items
        WHERE user_id = $1
        ORDER BY created_at ASC
        `,
        [userId]
      );

      const workRes = await client.query(
        `
        SELECT
          id,
          position,
          company,
          start_date,
          end_date,
          location,
          total_years,
          description,
          created_at,
          updated_at
        FROM candidate_work_items
        WHERE user_id = $1
        ORDER BY created_at ASC
        `,
        [userId]
      );

      academicRows = academicRes.rows;
      workRows = workRes.rows;
    }

    await client.query("COMMIT");

    return res.json({
      profile: {
        ...generalRes.rows[0],
        ...(isCandidate ? candidateProfile : {}),
        academic_items: academicRows,
        work_items: workRows,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error actualizando perfil" });
  } finally {
    client.release();
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "currentPassword y newPassword son requeridos",
      });
    }

    const trimmedCurrent = String(currentPassword).trim();
    const trimmedNew = String(newPassword).trim();

    if (trimmedNew.length < 8) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 8 caracteres",
        code: "WEAK_PASSWORD",
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, email, password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = userResult.rows[0];

    const isCurrentValid = await bcrypt.compare(
      trimmedCurrent,
      user.password_hash
    );

    if (!isCurrentValid) {
      return res.status(400).json({
        message: "La contraseña actual es incorrecta",
        code: "INVALID_CURRENT_PASSWORD",
      });
    }

    const isSamePassword = await bcrypt.compare(
      trimmedNew,
      user.password_hash
    );

    if (isSamePassword) {
      return res.status(400).json({
        message: "La nueva contraseña no puede ser igual a la actual",
        code: "SAME_PASSWORD",
      });
    }

    const newPasswordHash = await bcrypt.hash(trimmedNew, 10);

    await pool.query(
      `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
      `,
      [userId, newPasswordHash]
    );

    return res.json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Error cambiando contraseña",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({
        message: "token y password son requeridos",
      });
    }

    const trimmedPassword = String(password).trim();

    if (trimmedPassword.length < 8) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 8 caracteres",
        code: "WEAK_PASSWORD",
      });
    }

    const tokenHash = hashToken(token);

    const resetResult = await pool.query(
      `
      SELECT id, user_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!resetResult.rows.length) {
      return res.status(400).json({ message: "Token inválido" });
    }

    const resetRow = resetResult.rows[0];

    if (resetRow.used_at) {
      return res.status(400).json({ message: "Este enlace ya fue utilizado" });
    }

    if (new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({ message: "Este enlace ha expirado" });
    }

    const userResult = await pool.query(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [resetRow.user_id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = userResult.rows[0];

    const isSamePassword = await bcrypt.compare(
      trimmedPassword,
      user.password_hash
    );

    if (isSamePassword) {
      return res.status(400).json({
        message: "La nueva contraseña no puede ser igual a la anterior",
        code: "SAME_PASSWORD",
      });
    }

    const newPasswordHash = await bcrypt.hash(trimmedPassword, 10);

    await pool.query(
      `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
      `,
      [resetRow.user_id, newPasswordHash]
    );

    await pool.query(
      `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = $1
      `,
      [resetRow.id]
    );

    return res.json({
      message: "Contraseña restablecida correctamente",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en reset-password" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ message: "Email es requerido" });
    }

    const userResult = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (!userResult.rows.length) {
      return res.json({
        message:
          "Si el correo existe, te enviaremos instrucciones para restablecer tu contraseña.",
      });
    }

    const user = userResult.rows[0];

    await pool.query(
      `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      `,
      [user.id]
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      `,
      [user.id, tokenHash, expiresAt]
    );

    const FRONT_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${FRONT_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(
      cleanEmail
    )}`;

    try {
      await sendPasswordResetEmail(cleanEmail, resetUrl);
    } catch (mailErr) {
      console.error("Error enviando correo de recuperación:", mailErr);
      return res.status(500).json({
        message: "No se pudo enviar el correo de recuperación",
      });
    }

    return res.json({
      message:
        "Si el correo existe, te enviaremos instrucciones para restablecer tu contraseña.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en forgot-password" });
  }
};

exports.validateResetPasswordToken = async (req, res) => {
  try {
    const rawToken = String(req.query.token || "").trim();

    if (!rawToken) {
      return res.status(400).json({
        valid: false,
        message: "El enlace de recuperación no es válido.",
      });
    }

    const tokenHash = hashToken(rawToken);

    const resetResult = await pool.query(
      `
      SELECT id, user_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!resetResult.rows.length) {
      return res.status(400).json({
        valid: false,
        message: "Este enlace ya no se puede usar.",
      });
    }

    const resetRow = resetResult.rows[0];

    if (resetRow.used_at) {
      return res.status(400).json({
        valid: false,
        message: "Este enlace ya fue utilizado.",
      });
    }

    if (new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({
        valid: false,
        message: "Este enlace ha expirado.",
      });
    }

    return res.json({
      valid: true,
      message: "Token válido",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      valid: false,
      message: "Error validando el enlace de recuperación.",
    });
  }
};