require("dotenv").config();
const express = require("express");
const cors = require("cors");
const applicationsRoutes = require("./routes/applications.routes");
const jobsPublicRoutes = require("./routes/jobs.public.routes");
const messagesRoutes = require("./routes/messages.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", require("./routes/auth.routes"));
app.use("/admin", require("./routes/admin.routes"));
app.use("/candidate", require("./routes/candidate.routes"));
app.use("/admin/jobs", require("./routes/jobs.admin.routes"));
app.use("/admin/users", require("./routes/admin.users.routes"));

app.use(applicationsRoutes);
app.use(messagesRoutes);
app.use("/jobs", jobsPublicRoutes);

app.get("/", (req, res) => {
  res.send("API Humatyx funcionando");
});

app.use("/notifications", require("./routes/notifications.routes"));


module.exports = app;