const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const upload = require("../config/upload");
const candidate = require("../controllers/candidate.controller");
const requireCompleteProfile = require("../middlewares/requireCompleteProfile");

// CV
router.post(
  "/files/cv",
  requireAuth,
  requireCompleteProfile,
  upload.single("cv"),
  candidate.uploadCv
);

// 👇 también bloquear info y descarga
router.get(
  "/files/cv",
  requireAuth,
  requireCompleteProfile,
  candidate.getMyCvInfo
);

router.get(
  "/files/cv/download",
  requireAuth,
  requireCompleteProfile,
  candidate.downloadMyCv
);

module.exports = router;
