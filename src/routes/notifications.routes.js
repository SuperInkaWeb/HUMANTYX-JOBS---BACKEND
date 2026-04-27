const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const notifications = require("../controllers/notifications.controller");

router.get("/", requireAuth, notifications.listMyNotifications);
router.get("/unread-count", requireAuth, notifications.countUnreadNotifications);
router.patch("/read-all", requireAuth, notifications.markAllNotificationsAsRead);
router.patch(
  "/read-by-context",
  requireAuth,
  notifications.markNotificationsAsReadByContext
);
router.patch("/:id/read", requireAuth, notifications.markNotificationAsRead);

module.exports = router;