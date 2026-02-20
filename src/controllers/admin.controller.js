const pool = require("../db");
const path = require("path");


exports.listCandidates = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.first_name, p.last_name, p.phone, p.dni, p.updated_at
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
              p.first_name, p.last_name, p.phone, p.dni, p.updated_at
       FROM users u
       LEFT JOIN candidate_profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.role = 'CANDIDATE'
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Candidato no encontrado" });
    }

    return res.json({ candidate: result.rows[0] });
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

