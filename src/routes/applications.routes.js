const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const requireCompleteProfile = require("../middlewares/requireCompleteProfile");
const applications = require("../controllers/applications.controller");

// CANDIDATE
router.post(
  "/candidate/applications",
  requireAuth,
  requireRole("CANDIDATE"),
  requireCompleteProfile,
  applications.applyToJob
);

router.get(
  "/candidate/applications",
  requireAuth,
  requireRole("CANDIDATE"),
  applications.listMyApplications
);

// ADMIN / RRHH
router.get(
  "/admin/jobs/:id/applications",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  applications.listApplicationsByJob
);

router.patch(
  "/admin/applications/:id/status",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  applications.updateApplicationStatus
);

module.exports = router;