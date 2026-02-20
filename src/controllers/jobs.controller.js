const pool = require("../db");

const allowedStatus = new Set(["DRAFT", "PUBLISHED", "CLOSED"]);

exports.createJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, location, employment_type, salary_range, status } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "title y description son requeridos" });
    }
    if (status && !allowedStatus.has(status)) {
      return res.status(400).json({ message: "status inválido" });
    }

    const result = await pool.query(
      `INSERT INTO jobs (title, description, location, employment_type, salary_range, status, created_by)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::job_status,'DRAFT'::job_status), $7)
       RETURNING *`,
      [title, description, location || null, employment_type || null, salary_range || null, status || null, userId]
    );

    return res.status(201).json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando vacante" });
  }
};

exports.listJobsAdmin = async (req, res) => {
  try {
    const { status } = req.query; // opcional
    const params = [];
    let where = "";

    if (status) {
      if (!allowedStatus.has(status)) return res.status(400).json({ message: "status inválido" });
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM jobs
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
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

    const result = await pool.query(`SELECT * FROM jobs WHERE id = $1 LIMIT 1`, [id]);
    if (!result.rows.length) return res.status(404).json({ message: "Vacante no encontrada" });

    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error obteniendo vacante" });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, location, employment_type, salary_range } = req.body;

    // update parcial
    const result = await pool.query(
      `UPDATE jobs SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         location = COALESCE($3, location),
         employment_type = COALESCE($4, employment_type),
         salary_range = COALESCE($5, salary_range),
         updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title || null, description || null, location || null, employment_type || null, salary_range || null, id]
    );

    if (!result.rows.length) return res.status(404).json({ message: "Vacante no encontrada" });
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
      `UPDATE jobs SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (!result.rows.length) return res.status(404).json({ message: "Vacante no encontrada" });
    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error actualizando status" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`DELETE FROM jobs WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows.length) return res.status(404).json({ message: "Vacante no encontrada" });

    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error eliminando vacante" });
  }
};
