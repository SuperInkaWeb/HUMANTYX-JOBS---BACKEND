const router = require("express").Router();
const auth = require("../controllers/auth.controller");
const requireAuth = require("../middlewares/requireAuth");


router.post("/register", auth.register);//registrar
router.post("/login", auth.login);//loguearse
router.get("/me", requireAuth, auth.me);//obtener token
router.put("/me/profile", requireAuth, auth.updateMyProfile);//actualizar perfil



module.exports = router;
