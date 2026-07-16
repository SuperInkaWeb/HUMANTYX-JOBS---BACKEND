const pool = require("../db");
const path = require("path");
const fs = require("fs");

function getUploadFilePath(storedName) {
  const safeStoredName = path.basename(storedName || "");

  if (!safeStoredName) {
    return null;
  }

  return path.join(process.cwd(), "uploads", safeStoredName);
}

function getSafeOriginalFileName(originalName) {
  const safeName = path.basename(originalName || "").trim();
  return safeName || "curriculum.pdf";
}

async function deleteFileIfExists(filePath) {
  if (!filePath) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

exports.uploadCv = async (req, res) => {
  const newFilePath = req.file
    ? getUploadFilePath(req.file.filename)
    : null;

  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        message: "El archivo CV es requerido",
      });
    }

    const { originalname, filename, mimetype, size } = req.file;

    // Buscar el CV anterior antes de actualizar la base de datos.
    const previousCvResult = await pool.query(
      `
      SELECT stored_name
      FROM candidate_files
      WHERE user_id = $1
        AND doc_type = 'CV'
      LIMIT 1
      `,
      [userId]
    );

    const previousStoredName =
      previousCvResult.rows[0]?.stored_name || null;

    // Crear o actualizar el registro del CV.
    const upsert = await pool.query(
      `
      INSERT INTO candidate_files (
        user_id,
        doc_type,
        original_name,
        stored_name,
        mime_type,
        size_bytes
      )
      VALUES ($1, 'CV', $2, $3, $4, $5)

      ON CONFLICT (user_id)
      WHERE doc_type = 'CV'

      DO UPDATE SET
        original_name = EXCLUDED.original_name,
        stored_name   = EXCLUDED.stored_name,
        mime_type     = EXCLUDED.mime_type,
        size_bytes    = EXCLUDED.size_bytes,
        created_at    = NOW()

      RETURNING
        id,
        user_id,
        doc_type,
        original_name,
        stored_name,
        mime_type,
        size_bytes,
        created_at
      `,
      [userId, originalname, filename, mimetype, size]
    );

    // Eliminar el archivo anterior únicamente después de actualizar la BD.
    if (previousStoredName && previousStoredName !== filename) {
      const previousFilePath = getUploadFilePath(previousStoredName);

      try {
        await deleteFileIfExists(previousFilePath);
      } catch (deleteError) {
        console.error("No se pudo eliminar el CV anterior:", {
          userId,
          previousStoredName,
          error: deleteError.message,
        });
      }
    }

    return res.status(201).json({
      message: "CV subido correctamente",
      cv: upsert.rows[0],
    });
  } catch (err) {
    console.error("Error subiendo CV:", err);

    // Si Multer guardó el archivo nuevo pero falló la base de datos,
    // se elimina para evitar dejar un archivo huérfano.
    if (newFilePath) {
      try {
        await deleteFileIfExists(newFilePath);
      } catch (deleteError) {
        console.error("No se pudo limpiar el nuevo CV:", {
          filePath: newFilePath,
          error: deleteError.message,
        });
      }
    }

    return res.status(500).json({
      message: err.message || "Error subiendo CV",
    });
  }
};

exports.getMyCvInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        doc_type,
        original_name,
        mime_type,
        size_bytes,
        created_at
      FROM candidate_files
      WHERE user_id = $1
        AND doc_type = 'CV'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        code: "CV_NOT_REGISTERED",
        message: "No hay CV subido",
      });
    }

    return res.json({
      cv: result.rows[0],
    });
  } catch (err) {
    console.error("Error obteniendo información del CV:", err);

    return res.status(500).json({
      message: "Error obteniendo CV",
    });
  }
};

exports.downloadMyCv = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        stored_name,
        original_name,
        mime_type
      FROM candidate_files
      WHERE user_id = $1
        AND doc_type = 'CV'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        code: "CV_NOT_REGISTERED",
        message: "No tienes un CV subido",
      });
    }

    const cv = result.rows[0];
    const filePath = getUploadFilePath(cv.stored_name);

    if (!filePath || !fs.existsSync(filePath)) {
      console.error("Archivo físico del CV no encontrado:", {
        userId,
        storedName: cv.stored_name,
        originalName: cv.original_name,
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
      cv.mime_type || "application/octet-stream"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );

    return res.sendFile(filePath, (error) => {
      if (!error) return;

      console.error("Error enviando el CV del candidato:", {
        userId,
        filePath,
        error: error.message,
      });

      if (!res.headersSent) {
        return res.status(500).json({
          code: "CV_SEND_ERROR",
          message: "No se pudo descargar el CV",
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