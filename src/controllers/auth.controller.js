const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

/* =========================
   REGISTER
========================= */
exports.register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email y password requeridos" });

    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows.length)
      return res.status(409).json({ message: "Email ya registrado" });

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [email, passwordHash]
    );

    const user = userResult.rows[0];

    // Crear perfil vacío
    await pool.query("INSERT INTO candidate_profiles (user_id) VALUES ($1)", [user.id]);

    const token = signToken({ id: user.id, role: user.role });

    return res.status(201).json({ token, user });
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

    if (!email || !password)
      return res.status(400).json({ message: "Email y password requeridos" });

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (!result.rows.length)
      return res.status(401).json({ message: "Credenciales inválidas" });

    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ message: "Credenciales inválidas" });

    const token = signToken({ id: user.id, role: user.role });

    return res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
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
        u.created_at,

        p.first_name,
        p.last_name,
        p.phone,

        p.document_type,
        p.document_number,

        p.country,
        p.department,
        p.city,
        p.birth_date,
        p.gender,
        p.marital_status,
        p.headline,
        p.about,
        p.education_level,
        p.experience_years,
        p.availability,
        p.profile_completed_at,
        p.updated_at,

        CASE
          WHEN p.first_name IS NOT NULL
           AND p.last_name IS NOT NULL
           AND p.phone IS NOT NULL
           AND p.document_type IS NOT NULL
           AND p.document_number IS NOT NULL
           AND p.country IS NOT NULL
           AND p.department IS NOT NULL
           AND p.city IS NOT NULL
          THEN true
          ELSE false
        END AS profile_complete

      FROM users u
      LEFT JOIN candidate_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en /me" });
  }
};

/* =========================
   PUT /auth/me/profile
========================= */
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      first_name,
      last_name,
      phone,
      document_type,
      document_number,
      country,
      department,
      city,
      birth_date,
      gender,
      marital_status,
      headline,
      about,
      education_level,
      experience_years,
      availability,
    } = req.body;

    const nothingToUpdate =
      first_name === undefined &&
      last_name === undefined &&
      phone === undefined &&
      document_type === undefined &&
      document_number === undefined &&
      country === undefined &&
      department === undefined &&
      city === undefined &&
      birth_date === undefined &&
      gender === undefined &&
      marital_status === undefined &&
      headline === undefined &&
      about === undefined &&
      education_level === undefined &&
      experience_years === undefined &&
      availability === undefined;

    if (nothingToUpdate)
      return res.status(400).json({ message: "No hay campos para actualizar" });

    const result = await pool.query(
      `
      UPDATE candidate_profiles
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),

          document_type = COALESCE($4, document_type),
          document_number = COALESCE($5, document_number),

          country = COALESCE($6, country),
          department = COALESCE($7, department),
          city = COALESCE($8, city),
          birth_date = COALESCE($9, birth_date),
          gender = COALESCE($10, gender),
          marital_status = COALESCE($11, marital_status),
          headline = COALESCE($12, headline),
          about = COALESCE($13, about),
          education_level = COALESCE($14, education_level),
          experience_years = COALESCE($15, experience_years),
          availability = COALESCE($16, availability),
          updated_at = NOW()
      WHERE user_id = $17
      RETURNING *
      `,
      [
        first_name ?? null,
        last_name ?? null,
        phone ?? null,
        document_type ?? null,
        document_number ?? null,
        country ?? null,
        department ?? null,
        city ?? null,
        birth_date ?? null,
        gender ?? null,
        marital_status ?? null,
        headline ?? null,
        about ?? null,
        education_level ?? null,
        experience_years ?? null,
        availability ?? null,
        userId,
      ]
    );

    const profile = result.rows[0];

    const isComplete =
      profile.first_name &&
      profile.last_name &&
      profile.phone &&
      profile.document_type &&
      profile.document_number &&
      profile.country &&
      profile.department &&
      profile.city;

    if (isComplete && !profile.profile_completed_at) {
      await pool.query(
        `UPDATE candidate_profiles
         SET profile_completed_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
    }

    return res.json({ profile });
  } catch (err) {
    // Si más adelante pones UNIQUE a document_number, aquí podrías capturar 23505 también
    console.error(err);
    return res.status(500).json({ message: "Error actualizando perfil" });
  }
};