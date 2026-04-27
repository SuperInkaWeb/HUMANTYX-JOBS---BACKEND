const router = require("express").Router();
const auth = require("../controllers/auth.controller");
const requireAuth = require("../middlewares/requireAuth");
const inviteAuth = require("../controllers/auth.invite.controller");


router.post("/register", auth.register);//registrar
router.post("/login", auth.login);//loguearse
router.get("/me", requireAuth, auth.me);//obtener token
router.put("/me/profile", requireAuth, auth.updateMyProfile);//actualizar perfil
router.post("/set-password", inviteAuth.setPasswordFromInvite);
router.get("/invites/validate", inviteAuth.validateInvite);
router.patch("/change-password", requireAuth, auth.changePassword);


router.post("/forgot-password", auth.forgotPassword);
router.post("/reset-password", auth.resetPassword);
router.get("/reset-password/validate", auth.validateResetPasswordToken);

module.exports = router;
