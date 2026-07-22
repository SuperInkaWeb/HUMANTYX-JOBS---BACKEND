const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const requireJobCandidateAccess = require("../middlewares/requireJobCandidateAccess");
const admin = require("../controllers/admin.controller");

// Lista general de candidatos: ADMIN y RRHH
router.get(
  "/candidates",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  admin.listCandidates
);

// Perfil general de candidato: ADMIN y RRHH
router.get(
  "/candidates/:id",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  admin.getCandidateById
);

// CV general del candidato: ADMIN y RRHH
router.get(
  "/candidates/:id/cv",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  admin.getCandidateCv
);

router.delete(
  "/candidates/:id",
  requireAuth,
  requireRole("ADMIN"),
  admin.deleteCandidate
);

// Candidatos por vacante
router.get(
  "/jobs/:jobId/candidates/:candidateId/profile",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobCandidateAccess,
  admin.getCandidateById
);

router.get(
  "/jobs/:jobId/candidates/:candidateId/cv",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobCandidateAccess,
  admin.getCandidateCv
);

router.get(
  "/jobs/:jobId/candidates/:candidateId/cv/preview",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobCandidateAccess,
  admin.previewCandidateCv
);

router.get(
  "/dashboard/summary",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  admin.getDashboardSummary
);

module.exports = router;