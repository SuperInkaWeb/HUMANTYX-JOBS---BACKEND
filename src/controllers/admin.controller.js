const pool = require("../db");
const path = require("path");
const fs = require("fs");

function resolveCandidateId(params) {
  return params.candidateId || params.id;
}

function resolveCvFilePath(storedName) {
  const safeStoredName = path.basename(storedName || "");

  if (!safeStoredName) {
    return null;
  }

  const possiblePaths = [
    // Ruta principal utilizada actualmente por Multer.
    path.join(process.cwd(), "uploads", safeStoredName),

    // Compatibilidad con archivos antiguos guardados en uploads/cvs.
    path.join(process.cwd(), "uploads", "cvs", safeStoredName),

    // Compatibilidad adicional según la ubicación del controlador.
    path.join(__dirname, "..", "..", "uploads", safeStoredName),

    path.join(__dirname, "..", "..", "uploads", "cvs", safeStoredName),
  ];

  return possiblePaths.find((filePath) => fs.existsSync(filePath)) || null;
}

function getSafeOriginalFileName(originalName, fallback = "curriculum.pdf") {
  const safeName = path.basename(originalName || "").trim();
  return safeName || fallback;
}

exports.listCandidates = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        u.is_active,

        up.first_name,
        up.last_name,
        up.phone,
        up.document_type,
        up.document_number,
        up.country,
        up.department,
        up.city,
        up.district,
        up.address_line,
        up.postal_code,
        up.birth_date,
        up.gender,
        up.marital_status,

        cp.headline,
        cp.education_level,
        cp.experience_years,
        cp.desired_salary,
        cp.availability,
        cp.profile_completed_at
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      WHERE u.role = 'CANDIDATE'
      ORDER BY u.created_at DESC
      `
    );

    return res.json({
      candidates: result.rows,
    });
  } catch (err) {
    console.error("Error listando candidatos:", err);

    return res.status(500).json({
      message: "Error listando candidatos",
    });
  }
};

exports.getCandidateById = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        u.is_active,

        up.first_name,
        up.last_name,
        up.phone,
        up.document_type,
        up.document_number,
        up.country,
        up.department,
        up.city,
        up.district,
        up.address_line,
        up.postal_code,
        up.birth_date,
        up.gender,
        up.marital_status,
        up.updated_at AS profile_updated_at,

        cp.headline,
        cp.about,
        cp.linkedin_url,
        cp.portfolio_url,
        cp.education_level,
        cp.experience_years,
        cp.desired_salary,
        cp.availability,
        cp.profile_completed_at,
        cp.updated_at AS candidate_profile_updated_at,

        cf.original_name AS cv_original_name,
        cf.mime_type AS cv_mime_type,
        cf.size_bytes AS cv_size_bytes,
        cf.created_at AS cv_created_at
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp
        ON cp.user_id = u.id
      LEFT JOIN candidate_files cf
        ON cf.user_id = u.id
       AND cf.doc_type = 'CV'
      WHERE u.id = $1
        AND u.role = 'CANDIDATE'
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Candidato no encontrado",
      });
    }

    const candidate = result.rows[0];

    const academicRes = await pool.query(
      `
      SELECT
        id,
        education_level,
        institution,
        career,
        academic_status,
        start_date,
        end_date,
        location,
        total_years,
        created_at,
        updated_at
      FROM candidate_academic_items
      WHERE user_id = $1
      ORDER BY created_at ASC
      `,
      [candidateId]
    );

    const workRes = await pool.query(
      `
      SELECT
        id,
        position,
        company,
        start_date,
        end_date,
        location,
        total_years,
        description,
        created_at,
        updated_at
      FROM candidate_work_items
      WHERE user_id = $1
      ORDER BY created_at ASC
      `,
      [candidateId]
    );

    return res.json({
      candidate: {
        ...candidate,
        academic_items: academicRes.rows,
        work_items: workRes.rows,
      },
    });
  } catch (err) {
    console.error("Error obteniendo candidato:", err);

    return res.status(500).json({
      message: "Error obteniendo candidato",
    });
  }
};

exports.getCandidateCv = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        cf.id,
        cf.user_id,
        cf.doc_type,
        cf.original_name,
        cf.stored_name,
        cf.mime_type,
        cf.size_bytes,
        cf.created_at
      FROM candidate_files cf
      WHERE cf.user_id = $1
        AND cf.doc_type = 'CV'
      ORDER BY cf.created_at DESC
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        code: "CV_NOT_REGISTERED",
        message: "Este postulante aún no ha subido un CV.",
      });
    }

    const cv = result.rows[0];
    const filePath = resolveCvFilePath(cv.stored_name);

    if (!filePath) {
      console.error("========================================");
      console.error("CV NO ENCONTRADO");
      console.error("Candidate ID:", candidateId);
      console.error("Nombre original:", cv.original_name);
      console.error("Nombre almacenado:", cv.stored_name);
      console.error(
        "Carpeta uploads:",
        path.join(process.cwd(), "uploads")
      );
      console.error("========================================");

      return res.status(404).json({
        code: "CV_FILE_NOT_FOUND",
        message:
          "El CV está registrado, pero el archivo no se encuentra en el servidor.",
      });
    }

    const safeOriginalName = getSafeOriginalFileName(cv.original_name);

    res.setHeader(
      "Content-Type",
      cv.mime_type || "application/octet-stream"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );

    return res.sendFile(filePath, (error) => {
      if (!error) return;

      console.error("Error enviando CV:", {
        candidateId,
        filePath,
        error: error.message,
      });

      if (!res.headersSent) {
        return res.status(500).json({
          code: "CV_SEND_ERROR",
          message: "No se pudo enviar el archivo CV.",
        });
      }
    });
  } catch (err) {
    console.error("Error descargando CV:", err);

    return res.status(500).json({
      code: "CV_DOWNLOAD_ERROR",
      message: "Error descargando CV",
    });
  }
};

exports.previewCandidateCv = async (req, res) => {
  try {
    const candidateId = resolveCandidateId(req.params);

    const result = await pool.query(
      `
      SELECT
        cf.id,
        cf.user_id,
        cf.doc_type,
        cf.original_name,
        cf.stored_name,
        cf.mime_type,
        cf.size_bytes,
        cf.created_at
      FROM candidate_files cf
      WHERE cf.user_id = $1
        AND cf.doc_type = 'CV'
      ORDER BY cf.created_at DESC
      LIMIT 1
      `,
      [candidateId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        code: "CV_NOT_REGISTERED",
        message: "Este postulante aún no ha subido un CV.",
      });
    }

    const cv = result.rows[0];
    const filePath = resolveCvFilePath(cv.stored_name);

    if (!filePath) {
      console.error("CV NO ENCONTRADO PARA PREVISUALIZACIÓN", {
        candidateId,
        originalName: cv.original_name,
        storedName: cv.stored_name,
        uploadsDirectory: path.join(process.cwd(), "uploads"),
      });

      return res.status(404).json({
        code: "CV_FILE_NOT_FOUND",
        message:
          "El CV está registrado, pero el archivo no se encuentra en el servidor.",
      });
    }

    const safeOriginalName = getSafeOriginalFileName(cv.original_name);

    res.setHeader(
      "Content-Type",
      cv.mime_type || "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );

    const fileStream = fs.createReadStream(filePath);

    fileStream.on("error", (error) => {
      console.error("Error leyendo CV para previsualización:", error);

      if (!res.headersSent) {
        return res.status(500).json({
          code: "CV_READ_ERROR",
          message: "No se pudo leer el archivo CV.",
        });
      }

      res.destroy(error);
    });

    return fileStream.pipe(res);
  } catch (err) {
    console.error("Error previsualizando CV:", err);

    return res.status(500).json({
      code: "CV_PREVIEW_ERROR",
      message: "Error previsualizando CV",
    });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const jobsRes = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM jobs
      WHERE status = 'PUBLISHED'
      `
    );

    const candidatesRes = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE role = 'CANDIDATE'
      `
    );

    const applicationsRes = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM job_applications
      `
    );

    return res.json({
      summary: {
        active_jobs: jobsRes.rows[0].count,
        candidates: candidatesRes.rows[0].count,
        applications: applicationsRes.rows[0].count,
        invites: 0,
      },
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);

    return res.status(500).json({
      message: "Error obteniendo resumen del dashboard",
      detail: err.message,
    });
  }
};

exports.deleteCandidate = async (req, res) => {
  const client = await pool.connect();

  try {
    const candidateId = req.params.id;

    await client.query("BEGIN");

    const candidateRes = await client.query(
      `
      SELECT
        id,
        email,
        role
      FROM users
      WHERE id = $1
        AND role = 'CANDIDATE'
      LIMIT 1
      `,
      [candidateId]
    );

    if (!candidateRes.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Candidato no encontrado",
      });
    }

    const applicationsRes = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM job_applications
      WHERE candidate_id = $1
      `,
      [candidateId]
    );

    const applicationsCount = applicationsRes.rows[0].count;

    if (applicationsCount > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        code: "CANDIDATE_HAS_APPLICATIONS",
        message:
          "Este candidato tiene postulaciones registradas y no puede eliminarse. Debe archivarse.",
        applications_count: applicationsCount,
      });
    }

    const filesRes = await client.query(
      `
      SELECT stored_name
      FROM candidate_files
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM candidate_work_items
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM candidate_academic_items
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM candidate_files
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM candidate_profiles
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM user_profiles
      WHERE user_id = $1
      `,
      [candidateId]
    );

    await client.query(
      `
      DELETE FROM users
      WHERE id = $1
        AND role = 'CANDIDATE'
      `,
      [candidateId]
    );

    await client.query("COMMIT");

    for (const file of filesRes.rows) {
      const filePath = resolveCvFilePath(file.stored_name);

      if (!filePath) continue;

      try {
        fs.unlinkSync(filePath);
      } catch (fileError) {
        console.error("No se pudo eliminar el archivo CV:", {
          candidateId,
          filePath,
          error: fileError.message,
        });
      }
    }

    return res.json({
      message: "Candidato eliminado correctamente",
      candidate_id: candidateId,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Error eliminando candidato:", err);

    return res.status(500).json({
      message: "Error eliminando candidato",
      detail: err.message,
    });
  } finally {
    client.release();
  }
};