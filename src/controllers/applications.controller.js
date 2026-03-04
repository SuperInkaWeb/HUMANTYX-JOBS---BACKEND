const pool = require("../db");

/**
 * POST /candidate/applications
 * Body: { job_id }
 * CANDIDATE se postula a una vacante
 */
exports.applyToJob = async (req, res) => {
  try {
    const candidateId = req.user.id;
    const { job_id } = req.body || {};

    if (!job_id) {
      return res.status(400).json({ message: "job_id es requerido" });
    }

    // 1) Validar perfil completo (defensivo, aunque tengas middleware)
    const profileRes = await pool.query(
      `SELECT first_name, last_name, phone, document_type, document_number
       FROM candidate_profiles
       WHERE user_id = $1`,
      [candidateId]
    );

    const p = profileRes.rows[0];

    const incomplete =
      !p ||
      !p.first_name ||
      !p.last_name ||
      !p.phone ||
      !p.document_type ||
      !p.document_number;

    if (incomplete) {
      return res.status(403).json({
        message:
          "Perfil incompleto. Completa nombres, apellidos, teléfono y tu documento (tipo y número) antes de postular.",
        code: "PROFILE_INCOMPLETE",
      });
    }

    // 2) validar que el job exista
    const jobCheck = await pool.query(
      `SELECT id, status FROM jobs WHERE id = $1 LIMIT 1`,
      [job_id]
    );

    if (!jobCheck.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    // bloquear postulación a CLOSED:
    if (jobCheck.rows[0].status === "CLOSED") {
      return res
        .status(400)
        .json({ message: "No se puede postular a una vacante cerrada" });
    }

    const result = await pool.query(
      `INSERT INTO job_applications (job_id, candidate_id)
       VALUES ($1, $2)
       RETURNING id, job_id, candidate_id, status, created_at`,
      [job_id, candidateId]
    );

    return res.status(201).json({ application: result.rows[0] });
  } catch (err) {
    // UNIQUE (job_id, candidate_id) => evita doble postulación
    if (err.code === "23505") {
      return res.status(409).json({ message: "Ya postulaste a esta vacante" });
    }
    console.error(err);
    return res.status(500).json({ message: "Error postulando a la vacante" });
  }
};

/**
 * GET /candidate/applications
 * Lista postulaciones del candidato logueado
 */
exports.listMyApplications = async (req, res) => {
  try {
    const candidateId = req.user.id;

    const result = await pool.query(
      `SELECT
         a.id,
         a.status,
         a.created_at,
         j.id AS job_id,
         j.title,
         j.location,
         j.employment_type,
         j.salary_range,
         j.status AS job_status
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.candidate_id = $1
       ORDER BY a.created_at DESC`,
      [candidateId]
    );

    return res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando postulaciones" });
  }
};

/**
 * GET /admin/jobs/:id/applications
 * ADMIN/RRHH ven postulantes de una vacante
 */
exports.listApplicationsByJob = async (req, res) => {
  try {
    const { id: jobId } = req.params;

    const result = await pool.query(
      `SELECT
         a.id AS application_id,
         a.status AS application_status,
         a.created_at AS applied_at,
         u.id AS candidate_id,
         u.email,
         p.first_name,
         p.last_name,
         p.phone,
         p.document_type,
         p.document_number
       FROM job_applications a
       JOIN users u ON u.id = a.candidate_id
       LEFT JOIN candidate_profiles p ON p.user_id = u.id
       WHERE a.job_id = $1
       ORDER BY a.created_at DESC`,
      [jobId]
    );

    return res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando postulantes" });
  }
};

/**
 * PATCH /admin/applications/:id/status
 * Body: { status }
 * ADMIN/RRHH cambian estado de postulación
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { id: applicationId } = req.params;
    const { status } = req.body;

    const allowed = ["APPLIED", "IN_REVIEW", "INTERVIEW", "REJECTED", "HIRED"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ message: "status inválido" });
    }

    const result = await pool.query(
      `UPDATE job_applications
       SET status = $1::application_status
       WHERE id = $2
       RETURNING id, job_id, candidate_id, status, created_at`,
      [status, applicationId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    return res.json({ application: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error actualizando estado" });
  }
};