const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const requireJobCandidateAccess = require("../middlewares/requireJobCandidateAccess");
const admin = require("../controllers/admin.controller");

// Globales: solo ADMIN
router.get(
  "/candidates",
  requireAuth,
  requireRole("ADMIN"),
  admin.listCandidates
);

router.get(
  "/candidates/:id",
  requireAuth,
  requireRole("ADMIN"),
  admin.getCandidateById
);

router.get(
  "/candidates/:id/cv",
  requireAuth,
  requireRole("ADMIN"),
  admin.getCandidateCv
);

// Scoped por vacante: ADMIN y RRHH con validación de ownership
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