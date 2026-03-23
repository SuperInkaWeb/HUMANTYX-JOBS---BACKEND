const pool = require("../db");
const path = require("path");


exports.listCandidates = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.first_name,
              p.last_name,
              p.phone,
              p.document_type,
              p.document_number,
              p.headline,
              p.city,
              p.country,
              p.updated_at
       FROM users u
       LEFT JOIN candidate_profiles p ON p.user_id = u.id
       WHERE u.role = 'CANDIDATE'
       ORDER BY u.created_at DESC
       LIMIT 100`
    );

    return res.json({ candidates: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando candidatos" });
  }
};


exports.getCandidateById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
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
              p.updated_at
       FROM users u
       LEFT JOIN candidate_profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.role = 'CANDIDATE'
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Candidato no encontrado" });
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
      [id]
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
      [id]
    );

    return res.json({
      candidate: {
        ...result.rows[0],
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
    const { id } = req.params;

    const result = await pool.query(
      `SELECT stored_name, original_name, mime_type
       FROM candidate_files
       WHERE user_id = $1 AND doc_type = 'CV'
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "El candidato no tiene CV" });
    }

    const cv = result.rows[0];
    const filePath = path.join(process.cwd(), "uploads", cv.stored_name);

    
    res.setHeader("Content-Type", cv.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${cv.original_name}"`);

    return res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error obteniendo CV del candidato" });
  }
};

