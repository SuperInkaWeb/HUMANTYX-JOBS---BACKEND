const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const users = require("../controllers/admin.users.controller");

// SOLO ADMIN puede invitar
router.post("/invite", requireAuth, requireRole("ADMIN"), users.inviteUser);

module.exports = router;
