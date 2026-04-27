const pool = require("../db");

exports.listMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        type,
        title,
        message,
        link,
        is_read,
        read_at,
        created_at,
        application_id,
        job_id
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    return res.json({ notifications: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando notificaciones" });
  }
};

exports.countUnreadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS unread_count
      FROM notifications
      WHERE user_id = $1
        AND is_read = false
      `,
      [userId]
    );

    return res.json({
      unread_count: result.rows[0]?.unread_count || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error contando notificaciones" });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await pool.query(
      `
      UPDATE notifications
      SET
        is_read = true,
        read_at = COALESCE(read_at, NOW())
      WHERE id = $1
        AND user_id = $2
      RETURNING *
      `,
      [notificationId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    return res.json({ notification: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Error marcando notificación como leída" });
  }
};

exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `
      UPDATE notifications
      SET
        is_read = true,
        read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1
        AND is_read = false
      `,
      [userId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Error marcando todas como leídas" });
  }
};

exports.markNotificationsAsReadByContext = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, application_id, job_id, application_ids } = req.body || {};

    const allowedTypes = new Set([
      "NEW_MESSAGE",
      "NEW_APPLICATION",
      "APPLICATION_STATUS_CHANGED",
    ]);

    if (!type || !allowedTypes.has(type)) {
      return res.status(400).json({
        message: "type inválido",
      });
    }

    const hasSingleApplication = !!application_id;
    const hasMultipleApplications =
      Array.isArray(application_ids) && application_ids.length > 0;
    const hasJob = !!job_id;

    if (!hasSingleApplication && !hasMultipleApplications && !hasJob) {
      return res.status(400).json({
        message: "application_id, application_ids o job_id es requerido",
      });
    }

    const conditions = [`user_id = $1`, `type = $2`, `is_read = false`];
    const params = [userId, type];

    if (hasSingleApplication) {
      params.push(application_id);
      conditions.push(`application_id = $${params.length}`);
    }

    if (hasMultipleApplications) {
      params.push(application_ids);
      conditions.push(`application_id = ANY($${params.length}::uuid[])`);
    }

    if (hasJob) {
      params.push(job_id);
      conditions.push(`job_id = $${params.length}`);
    }

    const query = `
      UPDATE notifications
      SET
        is_read = true,
        read_at = COALESCE(read_at, NOW())
      WHERE ${conditions.join(" AND ")}
      RETURNING id
    `;

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      updated_count: result.rowCount || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Error marcando notificaciones por contexto",
    });
  }
};