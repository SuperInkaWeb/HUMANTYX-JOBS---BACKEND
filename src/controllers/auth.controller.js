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
        p.district,
        p.address_line,
        p.postal_code,

        p.birth_date,
        p.gender,
        p.marital_status,

        p.headline,
        p.about,
        p.linkedin_url,
        p.portfolio_url,
        p.education_level,
        p.experience_years,
        p.desired_salary,
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
          AND p.birth_date IS NOT NULL
          AND p.gender IS NOT NULL
          AND p.marital_status IS NOT NULL
          THEN true
          ELSE false
        END AS profile_complete

      FROM users u
      LEFT JOIN candidate_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

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

    return res.json({
      user: {
        ...result.rows[0],
        academic_items: academicRes.rows,
        work_items: workRes.rows,
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
      district === undefined &&
      address_line === undefined &&
      postal_code === undefined &&
      birth_date === undefined &&
      gender === undefined &&
      marital_status === undefined &&
      headline === undefined &&
      about === undefined &&
      linkedin_url === undefined &&
      portfolio_url === undefined &&
      education_level === undefined &&
      experience_years === undefined &&
      desired_salary === undefined &&
      availability === undefined &&
      academic_items === undefined &&
      work_items === undefined;

    if (nothingToUpdate) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    await client.query("BEGIN");

    const profileRes = await client.query(
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
          district = COALESCE($9, district),
          address_line = COALESCE($10, address_line),
          postal_code = COALESCE($11, postal_code),
          birth_date = COALESCE($12, birth_date),
          gender = COALESCE($13, gender),
          marital_status = COALESCE($14, marital_status),
          headline = COALESCE($15, headline),
          about = COALESCE($16, about),
          linkedin_url = COALESCE($17, linkedin_url),
          portfolio_url = COALESCE($18, portfolio_url),
          education_level = COALESCE($19, education_level),
          experience_years = COALESCE($20, experience_years),
          desired_salary = COALESCE($21, desired_salary),
          availability = COALESCE($22, availability),
          updated_at = NOW()
      WHERE user_id = $23
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
        district ?? null,
        address_line ?? null,
        postal_code ?? null,
        birth_date ?? null,
        gender ?? null,
        marital_status ?? null,
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

    const profile = profileRes.rows[0];

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

    if (isComplete && !profile.profile_completed_at) {
      await client.query(
        `
        UPDATE candidate_profiles
        SET profile_completed_at = NOW()
        WHERE user_id = $1
        `,
        [userId]
      );
    }

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

    await client.query("COMMIT");

    return res.json({
      profile: {
        ...profile,
        academic_items: academicRes.rows,
        work_items: workRes.rows,
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