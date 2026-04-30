const pool = require("../db");
const path = require("path");
const fs = require("fs");

function resolveCandidateId(params) {
  return params.candidateId || params.id;
}

function resolveCvFilePath(storedName) {
  const safeStoredName = path.basename(storedName || "");

  const possiblePaths = [
    // Ruta actual donde se guardan los CV al subirlos desde el perfil del candidato.
    path.join(__dirname, "..", "..", "uploads", safeStoredName),

    // Compatibilidad por si algún CV antiguo quedó dentro de uploads/cvs.
    path.join(__dirname, "..", "..", "uploads", "cvs", safeStoredName),
  ];

  return possiblePaths.find((filePath) => fs.existsSync(filePath)) || possiblePaths[0];
}

exports.listCandidates = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        u.is_active,

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

        cp.headline,
        cp.education_level,
        cp.experience_years,
        cp.desired_salary,
        cp.availability,
        cp.profile_completed_at
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      WHERE u.role = 'CANDIDATE'
      ORDER BY u.created_at DESC
      `
    );

    return res.json({ candidates: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando candidatos" });
  }
};

exports.getCandidateById = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        u.is_active,

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

        cf.original_name AS cv_original_name,
        cf.mime_type AS cv_mime_type,
        cf.size_bytes AS cv_size_bytes,
        cf.created_at AS cv_created_at
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      LEFT JOIN candidate_files cf
        ON cf.user_id = u.id
       AND cf.doc_type = 'CV'
      WHERE u.id = $1
        AND u.role = 'CANDIDATE'
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Candidato no encontrado" });
    }

    const candidate = result.rows[0];

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
      [candidateId]
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
      [candidateId]
    );

    return res.json({
      candidate: {
        ...candidate,
        academic_items: academicRes.rows,
        work_items: workRes.rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error obteniendo candidato" });
  }
};

exports.getCandidateCv = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        cf.id,
        cf.user_id,
        cf.doc_type,
        cf.original_name,
        cf.stored_name,
        cf.mime_type,
        cf.size_bytes,
        cf.created_at
      FROM candidate_files cf
      WHERE cf.user_id = $1
        AND cf.doc_type = 'CV'
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "CV no encontrado" });
    }

    const cv = result.rows[0];
    const filePath = resolveCvFilePath(cv.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Archivo CV no encontrado" });
    }

    return res.download(filePath, cv.original_name);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error descargando CV" });
  }
};

exports.previewCandidateCv = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        cf.id,
        cf.user_id,
        cf.doc_type,
        cf.original_name,
        cf.stored_name,
        cf.mime_type,
        cf.size_bytes,
        cf.created_at
      FROM candidate_files cf
      WHERE cf.user_id = $1
        AND cf.doc_type = 'CV'
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "CV no encontrado" });
    }

    const cv = result.rows[0];
    const filePath = resolveCvFilePath(cv.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Archivo CV no encontrado" });
    }

    res.setHeader("Content-Type", cv.mime_type || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${cv.original_name}"`);

    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error previsualizando CV" });
  }
};