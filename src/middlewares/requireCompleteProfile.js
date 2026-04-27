const pool = require("../db");

module.exports = async function requireCompleteProfile(req, res, next) {
  try {
    if (!req.user || req.user.role !== "CANDIDATE") {
      return next();
    }

    const result = await pool.query(
      `
      SELECT
        up.first_name,
        up.last_name,
        up.phone,
        up.document_type,
        up.document_number,
        up.country,
        up.department,
        up.city,
        up.birth_date,
        up.gender,
        up.marital_status
      FROM user_profiles up
      WHERE up.user_id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    const profile = result.rows[0];

    const isComplete = !!(
      profile?.first_name &&
      profile?.last_name &&
      profile?.phone &&
      profile?.document_type &&
      profile?.document_number &&
      profile?.country &&
      profile?.department &&
      profile?.city &&
      profile?.birth_date &&
      profile?.gender &&
      profile?.marital_status
    );

    if (!isComplete) {
      return res.status(403).json({
        message: "Debes completar tu perfil antes de postular.",
        code: "PROFILE_INCOMPLETE",
      });
    }

    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Error validando perfil completo",
    });
  }
};