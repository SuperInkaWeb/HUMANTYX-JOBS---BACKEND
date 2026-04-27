const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const requireJobAccess = require("../middlewares/requireJobAccess");
const jobs = require("../controllers/jobs.controller");

// ADMIN/RRHH
router.post("/", requireAuth, requireRole("ADMIN", "RRHH"), jobs.createJob);//crea vacante
router.get("/", requireAuth, requireRole("ADMIN", "RRHH"), jobs.listJobsAdmin);//lista todas las vacantes

router.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobAccess("id"),
  jobs.getJobByIdAdmin
);//obtiene una vacante por id

router.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobAccess("id"),
  jobs.updateJob
);//actualiza vacante

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobAccess("id"),
  jobs.updateJobStatus
);//actualizacion del estado de una vacante

router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireJobAccess("id"),
  jobs.deleteJob
);//borrar vacante


module.exports = router;