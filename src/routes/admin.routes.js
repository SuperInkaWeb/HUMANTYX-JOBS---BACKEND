const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const admin = require("../controllers/admin.controller");
console.log("admin keys:", Object.keys(admin));


router.get("/candidates", requireAuth, requireRole("ADMIN", "RRHH"), admin.listCandidates);//listado de candidatos
router.get("/candidates/:id",  requireAuth,  requireRole("ADMIN", "RRHH"),  admin.getCandidateById);//detalle de un candidato
router.get("/candidates/:id/cv",requireAuth,requireRole("ADMIN", "RRHH"), admin.getCandidateCv);//cv de un candidato
router.get(
  "/jobs/:jobId/candidates/:candidateId/cv/preview",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  admin.previewCandidateCv
);

module.exports = router;
