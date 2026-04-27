const pool = require("../db");

module.exports = function requireJobAccess(paramName = "id") {
  return async function (req, res, next) {
    try {
      const jobId = req.params?.[paramName];

      if (!jobId) {
        return res.status(400).json({ message: "jobId es requerido" });
      }

      const result = await pool.query(
        `
        SELECT id, created_by, status, title
        FROM jobs
        WHERE id = $1
        LIMIT 1
        `,
        [jobId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "Vacante no encontrada" });
      }

      const job = result.rows[0];
      req.job = job;

      if (req.user?.role === "ADMIN") {
        return next();
      }

      if (req.user?.role === "RRHH" && job.created_by === req.user.id) {
        return next();
      }

      return res.status(403).json({
        message: "No tienes permiso para gestionar esta vacante",
        code: "JOB_FORBIDDEN",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error validando acceso a vacante" });
    }
  };
};