const pool = require("../db");
const path = require("path");

exports.uploadCv = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "Archivo cv es requerido" });
    }

    const { originalname, filename, mimetype, size } = req.file;

    // Si ya existe CV, lo reemplazamos (update). Si no, insert.
    const upsert = await pool.query(
      `INSERT INTO candidate_files (user_id, doc_type, original_name, stored_name, mime_type, size_bytes)
       VALUES ($1, 'CV', $2, $3, $4, $5)
       ON CONFLICT (user_id) WHERE doc_type = 'CV'
       DO UPDATE SET
         original_name = EXCLUDED.original_name,
         stored_name   = EXCLUDED.stored_name,
         mime_type     = EXCLUDED.mime_type,
         size_bytes    = EXCLUDED.size_bytes,
         created_at    = NOW()
       RETURNING id, user_id, doc_type, original_name, stored_name, mime_type, size_bytes, created_at`,
      [userId, originalname, filename, mimetype, size]
    );

    return res.status(201).json({ cv: upsert.rows[0] });
  } catch (err) {
    console.error(err);
    // error de multer por tamaño/formato suele caer aquí como Error normal
    return res.status(400).json({ message: err.message || "Error subiendo CV" });
  }
};

exports.getMyCvInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, user_id, doc_type, original_name, mime_type, size_bytes, created_at
       FROM candidate_files
       WHERE user_id = $1 AND doc_type = 'CV'
       LIMIT 1`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "No hay CV subido" });
    }

    return res.json({ cv: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error obteniendo CV" });
  }
};


exports.downloadMyCv = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT stored_name, original_name, mime_type
       FROM candidate_files
       WHERE user_id = $1 AND doc_type = 'CV'
       LIMIT 1`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "No tienes CV subido" });
    }

    const cv = result.rows[0];
    const filePath = path.join(process.cwd(), "uploads", cv.stored_name);

    res.setHeader("Content-Type", cv.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${cv.original_name}"`
    );

    return res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error descargando CV" });
  }
};

