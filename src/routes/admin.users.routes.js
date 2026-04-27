const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const users = require("../controllers/admin.users.controller");

// SOLO ADMIN puede invitar
router.post("/invite", requireAuth, requireRole("ADMIN"), users.inviteUser);
router.get("/", requireAuth, requireRole("ADMIN"), users.listUsers);
router.patch("/:id/status", requireAuth, requireRole("ADMIN"), users.updateUserStatus);
router.get(
  "/user-invites",
  requireAuth,
  requireRole("ADMIN"),
  users.listUserInvites
);

router.patch(
  "/user-invites/:id/cancel",
  requireAuth,
  requireRole("ADMIN"),
  users.cancelInvite
);

router.post(
  "/user-invites/:id/resend",
  requireAuth,
  requireRole("ADMIN"),
  users.resendInvite
);

module.exports = router;


