const auth = require("./auth");

module.exports = async (req, res, next) => {
  try {
    // First verify JWT
    await auth(req, res, async () => {

      // Then check role
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Admin access only"
        });
      }

      next();
    });

  } catch (err) {
    return res.status(403).json({
      message: "Not authorized"
    });
  }
};
