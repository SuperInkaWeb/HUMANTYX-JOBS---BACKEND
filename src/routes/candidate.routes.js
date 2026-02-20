const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const upload = require("../config/upload");
const candidate = require("../controllers/candidate.controller");

// subir CV
router.post("/files/cv",  requireAuth,  upload.single("cv"),   candidate.uploadCv);

// obtener info del CV del usuario logueado
router.get("/files/cv", requireAuth, candidate.getMyCvInfo);

router.get("/files/cv/download", requireAuth, candidate.downloadMyCv);//descargar cv


module.exports = router;
