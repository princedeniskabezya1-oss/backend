module.exports = function adminOnly(req, res, next) {
  // TEMP admin check (later replaced by JWT)
  const adminEmail = "princedeniskabezya1@gmail.com";

  const userEmail = req.headers["x-user-email"];

  if (!userEmail || userEmail !== adminEmail) {
    return res.status(403).json({
      message: "Admin access required"
    });
  }

  next();
};
