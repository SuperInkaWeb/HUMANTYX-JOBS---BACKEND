const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const applications = require("../controllers/applications.controller");

// CANDIDATE
router.post("/candidate/applications", requireAuth, requireRole("CANDIDATE"), applications.applyToJob);//postular a un job
router.get("/candidate/applications", requireAuth, requireRole("CANDIDATE"), applications.listMyApplications);//listado de los jobs de un candidato

// ADMIN / RRHH
router.get("/admin/jobs/:id/applications", requireAuth, requireRole("ADMIN", "RRHH"), applications.listApplicationsByJob);//listar las aplicacion de un job
router.patch("/admin/applications/:id/status", requireAuth, requireRole("ADMIN", "RRHH"), applications.updateApplicationStatus);//listar el estado de un job

module.exports = router;
