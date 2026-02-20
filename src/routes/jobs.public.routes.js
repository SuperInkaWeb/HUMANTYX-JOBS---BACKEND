const router = require("express").Router();
const jobsPublic = require("../controllers/jobs.public.controller");
//vacantes para todo publico
router.get("/", jobsPublic.listPublishedJobs);     // GET /jobs lista jobs
router.get("/:id", jobsPublic.getPublishedJobById); // GET /jobs/:id lista job por id

module.exports = router;
