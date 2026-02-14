const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const jobsRoutes = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");

const app = express();

/* ============================================
   CORS CONFIGURATION (FIXED FOR PREFLIGHT)
============================================ */
app.use(cors({
  origin: "*", // you can restrict later to your Vercel domain
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Explicitly handle preflight requests
app.options("*", cors());

/* ============================================
   MIDDLEWARES
============================================ */
app.use(express.json());

/* ============================================
   ROUTES
============================================ */
app.get("/", (req, res) => {
  res.send("Backend is running 🟢");
});

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/users", userRoutes);

/* ============================================
   DATABASE CONNECTION
============================================ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log("Server started");
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
