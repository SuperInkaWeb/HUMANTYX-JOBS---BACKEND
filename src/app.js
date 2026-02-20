require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const applicationsRoutes = require("./routes/applications.routes");
const jobsPublicRoutes = require("./routes/jobs.public.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/auth", require("./routes/auth.routes"));
app.use("/admin", require("./routes/admin.routes"));
app.use("/candidate", require("./routes/candidate.routes"));
//app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/admin/jobs", require("./routes/jobs.admin.routes"));
app.use(applicationsRoutes);
app.use("/jobs", jobsPublicRoutes);







app.get("/", (req, res) => {
  res.send("API Humatyx funcionando");
});

module.exports = app;
