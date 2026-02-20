const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

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

    await pool.query("INSERT INTO candidate_profiles (user_id) VALUES ($1)", [user.id]);

    const token = signToken({ id: user.id, role: user.role });

    return res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error en register" });
  }
};

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


exports.me = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.first_name, p.last_name, p.phone, p.dni, p.updated_at
       FROM users u
       LEFT JOIN candidate_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
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

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone, dni } = req.body;

    // 1) Traer perfil actual (para saber si first/last ya existen)
    const currentRes = await pool.query(
      `SELECT first_name, last_name, phone, dni
       FROM candidate_profiles
       WHERE user_id = $1`,
      [userId]
    );

    // Si por alguna razón no existe, lo creamos "vacío" primero
    if (!currentRes.rows.length) {
      await pool.query(`INSERT INTO candidate_profiles (user_id) VALUES ($1)`, [userId]);
      currentRes.rows.push({ first_name: null, last_name: null, phone: null, dni: null });
    }

    const current = currentRes.rows[0];

    // 2) Reglas:
    // - Si first_name o last_name NO están aún en BD, entonces sí son obligatorios
    const firstMissing = !current.first_name;
    const lastMissing = !current.last_name;

    if ((firstMissing && !first_name) || (lastMissing && !last_name)) {
      return res.status(400).json({
        message: "first_name y last_name son requeridos para completar el perfil por primera vez",
      });
    }

    // 3) Si no envió ningún campo, no hacemos update
    const nothingToUpdate =
      first_name === undefined &&
      last_name === undefined &&
      phone === undefined &&
      dni === undefined;

    if (nothingToUpdate) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    // 4) Update parcial
    const result = await pool.query(
      `UPDATE candidate_profiles
       SET first_name = COALESCE($1, first_name),
           last_name  = COALESCE($2, last_name),
           phone      = COALESCE($3, phone),
           dni        = COALESCE($4, dni),
           updated_at = NOW()
       WHERE user_id = $5
       RETURNING user_id, first_name, last_name, phone, dni, updated_at`,
      [
        first_name === undefined ? null : first_name,
        last_name === undefined ? null : last_name,
        phone === undefined ? null : phone,
        dni === undefined ? null : dni,
        userId,
      ]
    );

    return res.json({ profile: result.rows[0] });
  } catch (err) {
    // 23505 = UNIQUE violation (por ejemplo DNI duplicado)
    if (err.code === "23505") {
      
      if (err.constraint && err.constraint.toLowerCase().includes("dni")) {
        return res.status(409).json({ message: "El DNI ya está registrado" });
      }
      return res.status(409).json({ message: "Dato duplicado" });
    }

    console.error(err);
    return res.status(500).json({ message: "Error actualizando perfil" });
  }
};



