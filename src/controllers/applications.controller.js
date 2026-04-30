const pool = require("../db");

const allowedStatuses = new Set([
  "APPLIED",
  "IN_REVIEW",
  "INTERVIEW",
  "REJECTED",
  "HIRED",
]);

function getStatusLabel(status) {
  const map = {
    APPLIED: "Postuló",
    IN_REVIEW: "En revisión",
    INTERVIEW: "Entrevista",
    REJECTED: "No seleccionado",
    HIRED: "Contratado",
  };

  return map[status] || status;
}

async function createNotification(
  client,
  {
    userId,
    type,
    title,
    message,
    link = null,
    applicationId = null,
    jobId = null,
  }
) {
  if (!userId) return;

  await client.query(
    `
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      application_id,
      job_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [userId, type, title, message, link, applicationId, jobId]
  );
}

exports.applyToJob = async (req, res) => {
  const client = await pool.connect();

  try {
    const candidateId = req.user.id;
    const { job_id } = req.body || {};

    if (!job_id) {
      return res.status(400).json({ message: "job_id es requerido" });
    }

    await client.query("BEGIN");

    const jobResult = await client.query(
      `
      SELECT id, title, status, created_by
      FROM jobs
      WHERE id = $1
      LIMIT 1
      `,
      [job_id]
    );

    if (!jobResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vacante no encontrada" });
    }

    const job = jobResult.rows[0];

    if (job.status !== "PUBLISHED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Solo puedes postular a vacantes publicadas.",
      });
    }

    const duplicate = await client.query(
      `
      SELECT id
      FROM job_applications
      WHERE job_id = $1
        AND candidate_id = $2
      LIMIT 1
      `,
      [job_id, candidateId]
    );

    if (duplicate.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Ya te has postulado a esta vacante.",
      });
    }

    const result = await client.query(
      `
      INSERT INTO job_applications (job_id, candidate_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [job_id, candidateId]
    );

    const application = result.rows[0];

    if (job.created_by && job.created_by !== candidateId) {
      await createNotification(client, {
        userId: job.created_by,
        type: "NEW_APPLICATION",
        title: "Nueva postulación recibida",
        message: `La vacante ${job.title} recibió una nueva postulación.`,
        link: `/rrhh/vacantes/${job.id}/postulantes`,
        applicationId: application.id,
        jobId: job.id,
      });
    }

    await client.query("COMMIT");

    return res.status(201).json({
      application,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error al postular a la vacante" });
  } finally {
    client.release();
  }
};

exports.listMyApplications = async (req, res) => {
  try {
    const candidateId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.job_id,
        a.candidate_id,
        a.status,
        a.created_at,

        j.title,
        j.location,
        j.employment_type,
        j.salary_range,
        j.description,
        j.status AS job_status,
        j.created_at AS job_created_at,
        j.updated_at AS job_updated_at,
        j.published_at,

        u.email AS creator_email,
        u.role AS creator_role,
        up.first_name AS creator_first_name,
        up.last_name AS creator_last_name,

        EXISTS (
          SELECT 1
          FROM application_conversations ac
          WHERE ac.application_id = a.id
        ) AS has_conversation,

        COALESCE((
          SELECT COUNT(*)::int
          FROM application_messages am
          JOIN application_conversations ac
            ON ac.id = am.conversation_id
          WHERE ac.application_id = a.id
            AND am.sender_role IN ('ADMIN', 'RRHH')
            AND am.read_by_candidate_at IS NULL
        ), 0) AS unread_messages_count
      FROM job_applications a
      JOIN jobs j
        ON j.id = a.job_id
      LEFT JOIN users u
        ON u.id = j.created_by
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE a.candidate_id = $1
      ORDER BY a.created_at DESC
      `,
      [candidateId]
    );

    return res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando postulaciones" });
  }
};

exports.listApplicationsByJob = async (req, res) => {
  try {
    const jobId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.job_id,
        a.candidate_id,
        a.status AS application_status,
        a.created_at AS application_created_at,

        up.first_name,
        up.last_name,
        up.phone,
        up.document_type,
        up.document_number,
        up.country,
        up.department,
        up.city,

        cp.headline,
        cp.about,
        cp.linkedin_url,
        cp.portfolio_url,
        cp.education_level,
        cp.experience_years,
        cp.desired_salary,
        cp.availability,
        cp.profile_completed_at,

        cf.original_name AS cv_original_name,
        cf.mime_type AS cv_mime_type,
        cf.size_bytes AS cv_size_bytes,
        cf.created_at AS cv_created_at,

        u.email,
        EXISTS (
          SELECT 1
          FROM application_conversations ac
          WHERE ac.application_id = a.id
        ) AS has_conversation,
        COALESCE((
          SELECT COUNT(*)::int
          FROM application_messages am
          JOIN application_conversations ac
            ON ac.id = am.conversation_id
          WHERE ac.application_id = a.id
            AND am.sender_role = 'CANDIDATE'
            AND am.read_by_staff_at IS NULL
        ), 0) AS unread_messages_count
      FROM job_applications a
      JOIN users u
        ON u.id = a.candidate_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      LEFT JOIN candidate_files cf
        ON cf.user_id = u.id
       AND cf.doc_type = 'CV'
      WHERE a.job_id = $1
      ORDER BY a.created_at DESC
      `,
      [jobId]
    );

    return res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando postulantes" });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    const applicationId = req.params.id;
    const { status } = req.body || {};

    if (!status || !allowedStatuses.has(status)) {
      return res.status(400).json({ message: "Estado de postulación inválido" });
    }

    await client.query("BEGIN");

    const beforeResult = await client.query(
      `
      SELECT
        a.id,
        a.status AS current_status,
        a.candidate_id,
        a.job_id,
        j.title AS job_title
      FROM job_applications a
      JOIN jobs j
        ON j.id = a.job_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    if (!beforeResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const current = beforeResult.rows[0];

    const result = await client.query(
      `
      UPDATE job_applications
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, applicationId]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    if (current.current_status !== status) {
      await createNotification(client, {
        userId: current.candidate_id,
        type: "APPLICATION_STATUS_CHANGED",
        title: "Estado de postulación actualizado",
        message: `Tu postulación a ${current.job_title} cambió a ${getStatusLabel(status)}.`,
        link: `/mis-postulaciones`,
        applicationId,
        jobId: current.job_id,
      });
    }

    await client.query("COMMIT");

    return res.json({ application: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error actualizando estado de postulación" });
  } finally {
    client.release();
  }
};