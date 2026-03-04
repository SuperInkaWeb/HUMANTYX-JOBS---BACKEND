const pool = require("../db");

module.exports = async function requireCompleteProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    console.log("Middleware ejecutado");
    console.log("Middleware ejecutado en:", req.method, req.originalUrl);
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    // Solo aplica a candidatos
    if (role !== "CANDIDATE") return next();

    const r = await pool.query(
      `
      SELECT
        CASE
          WHEN first_name IS NOT NULL
           AND last_name IS NOT NULL
           AND phone IS NOT NULL
           AND document_type IS NOT NULL
           AND document_number IS NOT NULL
           AND country IS NOT NULL
           AND department IS NOT NULL
           AND city IS NOT NULL
          THEN true ELSE false
        END AS profile_complete
      FROM candidate_profiles
      WHERE user_id = $1
      `,
      [userId]
    );

    const complete = r.rows[0]?.profile_complete === true;

    if (!complete) {
      return res.status(403).json({
        message: "Completa tu perfil antes de continuar",
        code: "PROFILE_INCOMPLETE",
      });
    }

    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error validando perfil" });
  }
};