const pool = require("../db");

/**
 * GET /jobs
 * Query opcional:
 * - q: búsqueda por título/descripcion
 * - location: filtra por ubicación
 */
exports.listPublishedJobs = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const location = (req.query.location || "").trim();
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];

    where.push(`status = 'PUBLISHED'`);

    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(title ILIKE $${params.length} OR description ILIKE $${params.length})`
      );
    }

    if (location) {
      params.push(`%${location}%`);
      where.push(`location ILIKE $${params.length}`);
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM jobs WHERE ${where.join(
      " AND "
    )}`;
    const countRes = await pool.query(countSql, params);
    const total = countRes.rows[0].total;

    params.push(limit);
    params.push(offset);

    const dataSql = `
      SELECT
        id,
        title,
        location,
        employment_type,
        salary_range,
        status,
        created_at,
        published_at
      FROM jobs
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const dataRes = await pool.query(dataSql, params);

    return res.json({
      page,
      limit,
      total,
      jobs: dataRes.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando vacantes públicas" });
  }
};

/**
 * GET /jobs/:id
 * Devuelve solo si está PUBLISHED
 */
exports.getPublishedJobById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         id,
         title,
         description,
         location,
         employment_type,
         salary_range,
         status,
         created_at,
         published_at,
         updated_at
       FROM jobs
       WHERE id = $1 AND status = 'PUBLISHED'
       LIMIT 1`,
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