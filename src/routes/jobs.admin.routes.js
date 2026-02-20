const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const jobs = require("../controllers/jobs.controller");

// ADMIN/RRHH
router.post("/", requireAuth, requireRole("ADMIN", "RRHH"), jobs.createJob);//crea vacante
router.get("/", requireAuth, requireRole("ADMIN", "RRHH"), jobs.listJobsAdmin);//lista todas las vacantes
router.get("/:id", requireAuth, requireRole("ADMIN", "RRHH"), jobs.getJobByIdAdmin);//obtiene una vacante por id
router.put("/:id", requireAuth, requireRole("ADMIN", "RRHH"), jobs.updateJob);//actualiza vacante
router.patch("/:id/status", requireAuth, requireRole("ADMIN", "RRHH"), jobs.updateJobStatus);//actualizacion del estado de una vacante
router.delete("/:id", requireAuth, requireRole("ADMIN", "RRHH"), jobs.deleteJob);//borrar vacante

module.exports = router;
