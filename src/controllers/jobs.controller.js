const pool = require("../db");

const allowedStatus = new Set(["DRAFT", "PUBLISHED", "CLOSED"]);
const allowedEmploymentTypes = new Set([
  "internship",
  "full_time",
  "part_time",
  "contract",
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateJobPayload(body) {
  const data = {
    title: cleanText(body.title),
    description: cleanText(body.description),
    location: cleanText(body.location),
    employment_type: cleanText(body.employment_type),
    salary_range: cleanText(body.salary_range),
    status: cleanText(body.status),
  };

  const errors = {};

  if (!data.title) errors.title = "El título es obligatorio.";
  if (!data.description) errors.description = "La descripción es obligatoria.";
  if (!data.location) errors.location = "La ubicación es obligatoria.";
  if (!data.salary_range) errors.salary_range = "El rango salarial es obligatorio.";

  if (!data.employment_type) {
    errors.employment_type = "El tipo de empleo es obligatorio.";
  } else if (!allowedEmploymentTypes.has(data.employment_type)) {
    errors.employment_type = "employment_type inválido";
  }

  if (!data.status) {
    errors.status = "El estado es obligatorio.";
  } else if (!allowedStatus.has(data.status)) {
    errors.status = "status inválido";
  }

  return {
    data,
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

exports.createJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, errors, isValid } = validateJobPayload(req.body);

    if (!isValid) {
      return res.status(400).json({
        message: "Todos los campos de la vacante son obligatorios.",
        errors,
      });
    }

    const publishedAt = data.status === "PUBLISHED" ? new Date() : null;

    const result = await pool.query(
      `INSERT INTO jobs (
         title,
         description,
         location,
         employment_type,
         salary_range,
         status,
         created_by,
         published_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::job_status, $7, $8)
       RETURNING *`,
      [
        data.title,
        data.description,
        data.location,
        data.employment_type,
        data.salary_range,
        data.status,
        userId,
        publishedAt,
      ]
    );

    return res.status(201).json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando vacante" });
  }
};

exports.listJobsAdmin = async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    const whereParts = [];

    if (status) {
      if (!allowedStatus.has(status)) {
        return res.status(400).json({ message: "status inválido" });
      }

      params.push(status);
      whereParts.push(`j.status = $${params.length}`);
    }

    if (req.user?.role === "RRHH") {
      params.push(req.user.id);
      whereParts.push(`j.created_by = $${params.length}`);
    }

    const where = whereParts.length
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";

    const result = await pool.query(
      `
      SELECT
        j.*,
        j.created_by AS created_by_user_id,
        u.email AS creator_email,
        u.role AS creator_role,
        up.first_name AS creator_first_name,
        up.last_name AS creator_last_name,
        COALESCE(app_counts.applicants_count, 0)::int AS applicants_count
      FROM jobs j
      JOIN users u
        ON u.id = j.created_by
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN (
        SELECT
          job_id,
          COUNT(*)::int AS applicants_count
        FROM job_applications
        GROUP BY job_id
      ) app_counts
        ON app_counts.job_id = j.id
      ${where}
      ORDER BY j.created_at DESC
      LIMIT 200
      `,
      params
    );

    return res.json({ jobs: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando vacantes" });
  }
};

exports.getJobByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        j.*,
        j.created_by AS created_by_user_id,
        u.email AS creator_email,
        u.role AS creator_role,
        up.first_name AS creator_first_name,
        up.last_name AS creator_last_name
      FROM jobs j
      JOIN users u
        ON u.id = j.created_by
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE j.id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error obteniendo vacante" });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, errors, isValid } = validateJobPayload(req.body);

    if (!isValid) {
      return res.status(400).json({
        message: "Todos los campos de la vacante son obligatorios.",
        errors,
      });
    }

    const result = await pool.query(
      `UPDATE jobs SET
         title = $1,
         description = $2,
         location = $3,
         employment_type = $4,
         salary_range = $5,
         status = $6::job_status,
         published_at = CASE
           WHEN $6::job_status = 'PUBLISHED' AND published_at IS NULL THEN NOW()
           ELSE published_at
         END,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        data.title,
        data.description,
        data.location,
        data.employment_type,
        data.salary_range,
        data.status,
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error actualizando vacante" });
  }
};

exports.updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !allowedStatus.has(status)) {
      return res.status(400).json({ message: "status inválido" });
    }

    const result = await pool.query(
      `UPDATE jobs
       SET
         status = $1,
         published_at = CASE
           WHEN $1::job_status = 'PUBLISHED' AND published_at IS NULL THEN NOW()
           ELSE published_at
         END,
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error actualizando status" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    const jobResult = await pool.query(
      `
      SELECT
        j.id,
        j.title,
        j.status,
        COALESCE(app_counts.applicants_count, 0)::int AS applicants_count
      FROM jobs j
      LEFT JOIN (
        SELECT
          job_id,
          COUNT(*)::int AS applicants_count
        FROM job_applications
        GROUP BY job_id
      ) app_counts
        ON app_counts.job_id = j.id
      WHERE j.id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!jobResult.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    const job = jobResult.rows[0];

    if (job.applicants_count > 0) {
      return res.status(409).json({
        message:
          "No se puede eliminar esta vacante porque ya tiene postulantes asociados.",
      });
    }

    if (job.status === "PUBLISHED") {
      return res.status(409).json({
        message:
          "No se puede eliminar una vacante publicada. Cámbiala a borrador o cerrada primero.",
      });
    }

    const result = await pool.query(
      `DELETE FROM jobs WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error eliminando vacante" });
  }
};