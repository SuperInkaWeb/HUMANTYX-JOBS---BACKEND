const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");

// 1) Ruta absoluta a la carpeta uploads
const uploadDir = path.join(process.cwd(), "uploads");

// 2) Crear carpeta si no existe (NO la recrea si ya existe)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 3) Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = crypto.randomBytes(16).toString("hex");
    cb(null, `${Date.now()}_${random}${ext}`);
  },
});

// 4) Filtro de archivos (PDF / DOC / DOCX)
function fileFilter(req, file, cb) {
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Formato no permitido. Sube PDF o DOC/DOCX."));
  }

  cb(null, true);
}

// 5) Exportar upload
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
