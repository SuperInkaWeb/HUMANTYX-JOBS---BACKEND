const pool = require("../db");

module.exports = async function requireApplicationAccess(req, res, next) {
  try {
    const applicationId = req.params?.id;

    if (!applicationId) {
      return res.status(400).json({ message: "applicationId es requerido" });
    }

    const result = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.job_id,
        a.candidate_id,
        j.created_by,
        j.title AS job_title,
        j.status AS job_status
      FROM job_applications a
      JOIN jobs j
        ON j.id = a.job_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const application = result.rows[0];
    req.applicationAccess = application;

    if (req.user?.role === "ADMIN") {
      return next();
    }

    if (
      req.user?.role === "RRHH" &&
      application.created_by === req.user.id
    ) {
      return next();
    }

    return res.status(403).json({
      message: "No tienes permiso para gestionar esta postulación",
      code: "APPLICATION_FORBIDDEN",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error validando acceso a postulación" });
  }
};