const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const requireRole = require("../middlewares/requireRole");
const requireApplicationAccess = require("../middlewares/requireApplicationAccess");
const messages = require("../controllers/messages.controller");

// ADMIN / RRHH
router.get(
  "/admin/applications/:id/messages",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireApplicationAccess,
  messages.listMessagesForStaff
);

router.post(
  "/admin/applications/:id/messages",
  requireAuth,
  requireRole("ADMIN", "RRHH"),
  requireApplicationAccess,
  messages.sendMessageFromStaff
);

// CANDIDATE
router.get(
  "/candidate/applications/:id/messages",
  requireAuth,
  requireRole("CANDIDATE"),
  messages.listMessagesForCandidate
);

router.post(
  "/candidate/applications/:id/messages/reply",
  requireAuth,
  requireRole("CANDIDATE"),
  messages.replyMessageAsCandidate
);

module.exports = router;