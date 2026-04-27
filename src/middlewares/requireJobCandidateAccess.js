const pool = require("../db");

module.exports = async function requireJobCandidateAccess(req, res, next) {
  try {
    const { jobId, candidateId } = req.params;

    if (!jobId || !candidateId) {
      return res.status(400).json({
        message: "jobId y candidateId son requeridos",
      });
    }

    const result = await pool.query(
      `
      SELECT
        j.id AS job_id,
        j.created_by,
        a.candidate_id
      FROM jobs j
      JOIN job_applications a
        ON a.job_id = j.id
      WHERE j.id = $1
        AND a.candidate_id = $2
      LIMIT 1
      `,
      [jobId, candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "No existe relación entre esta vacante y este postulante",
      });
    }

    const row = result.rows[0];
    req.jobCandidateAccess = row;

    if (req.user?.role === "ADMIN") {
      return next();
    }

    if (req.user?.role === "RRHH" && row.created_by === req.user.id) {
      return next();
    }

    return res.status(403).json({
      message: "No tienes permiso para acceder a este postulante",
      code: "JOB_CANDIDATE_FORBIDDEN",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Error validando acceso a postulante por vacante",
    });
  }
};