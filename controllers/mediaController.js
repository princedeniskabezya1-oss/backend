const express = require("express");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const mediaController = require("../controllers/mediaController");

const router = express.Router();

router.get(
    "/",
    auth,
    mediaController.getMedia
);

router.get(
    "/search",
    auth,
    mediaController.searchMedia
);

router.get(
    "/storage/summary",
    auth,
    mediaController.storageSummary
);

router.get(
    "/folders/list",
    auth,
    mediaController.listFolders
);

router.post(
    "/folders",
    auth,
    mediaController.createFolder
);

router.patch(
    "/folders/:id",
    auth,
    mediaController.updateFolder
);

router.delete(
    "/folders/:id",
    auth,
    mediaController.deleteFolder
);

router.post(
    "/upload",
    auth,
    upload.single("file"),
    mediaController.uploadMedia
);

router.post(
    "/upload-multiple",
    auth,
    upload.array("files",20),
    mediaController.uploadMultiple
);

router.patch(
    "/:id",
    auth,
    mediaController.updateMedia
);

router.delete(
    "/:id",
    auth,
    mediaController.deleteMedia
);

router.delete(
    "/:id/permanent",
    auth,
    mediaController.deletePermanent
);

router.post(
    "/:id/restore",
    auth,
    mediaController.restoreMedia
);

router.post(
    "/:id/favorite",
    auth,
    mediaController.favoriteMedia
);

router.post(
    "/:id/usage",
    auth,
    mediaController.trackUsage
);

router.post(
    "/bulk",
    auth,
    mediaController.bulkAction
);

module.exports = router;
