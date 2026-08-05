const express =
  require("express");

const mongoose =
  require("mongoose");

const auth =
  require("../middleware/auth");

const StudentResource =
  require("../models/StudentResource");


const router =
  express.Router();


/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_ROLES =
  new Set([
    "admin",
    "school",
    "teacher",
    "student",
    "talent"
  ]);


const ALLOWED_CATEGORIES =
  new Set([
    "note",
    "study-material",
    "reference",
    "assignment",
    "other"
  ]);


/* =========================================================
   HELPERS
========================================================= */

function normalizeId(
  value
) {
  return String(
    value?._id ||
    value ||
    ""
  ).trim();
}


function isValidObjectId(
  value
) {
  return mongoose.Types.ObjectId.isValid(
    normalizeId(
      value
    )
  );
}


function getUserRole(
  req
) {
  return String(
    req.user?.role ||
    ""
  )
    .trim()
    .toLowerCase();
}


function getAuthenticatedUserId(
  req
) {
  return normalizeId(
    req.user?._id ||
    req.user?.id
  );
}


function getAuthenticatedSchoolId(
  req
) {
  return normalizeId(
    req.user?.schoolId?._id ||
    req.user?.schoolId ||
    req.user?.linkedSchoolId?._id ||
    req.user?.linkedSchoolId ||
    req.user?.companyId?._id ||
    req.user?.companyId
  );
}


function userCanUseResources(
  req
) {
  return ALLOWED_ROLES.has(
    getUserRole(
      req
    )
  );
}


function sanitizeTags(
  value
) {
  const values =
    Array.isArray(
      value
    )
      ? value
      : String(
          value ||
          ""
        )
          .split(",");

  return Array.from(
    new Set(
      values
        .map(item =>
          String(
            item ||
            ""
          )
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  )
    .slice(
      0,
      20
    );
}


function canReadResource(
  req,
  resource
) {
  const role =
    getUserRole(
      req
    );

  const userId =
    getAuthenticatedUserId(
      req
    );

  if (
    role ===
    "admin"
  ) {
    return true;
  }

  if (
    normalizeId(
      resource.studentId
    ) ===
    userId
  ) {
    return true;
  }

  if (
    role ===
      "school" &&
    normalizeId(
      resource.schoolId
    ) ===
      userId
  ) {
    return true;
  }

  if (
    role ===
      "teacher"
  ) {
    const teacherSchoolId =
      getAuthenticatedSchoolId(
        req
      );

    return Boolean(
      teacherSchoolId &&
      normalizeId(
        resource.schoolId
      ) ===
        teacherSchoolId
    );
  }

  return false;
}


function canModifyResource(
  req,
  resource
) {
  const role =
    getUserRole(
      req
    );

  const userId =
    getAuthenticatedUserId(
      req
    );

  if (
    role ===
    "admin"
  ) {
    return true;
  }

  return (
    normalizeId(
      resource.studentId
    ) ===
    userId
  );
}


/* =========================================================
   GET /api/student-resources
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !userCanUseResources(
          req
        )
      ) {
        return res.status(
          403
        ).json({
          success:
            false,

          message:
            "You are not allowed to view student resources."
        });
      }

      const role =
        getUserRole(
          req
        );

      const userId =
        getAuthenticatedUserId(
          req
        );

      const query =
        {};


      if (
        role ===
        "admin"
      ) {
        if (
          req.query.studentId &&
          isValidObjectId(
            req.query.studentId
          )
        ) {
          query.studentId =
            req.query.studentId;
        }
      } else if (
        role ===
        "school"
      ) {
        query.schoolId =
          userId;

        if (
          req.query.studentId &&
          isValidObjectId(
            req.query.studentId
          )
        ) {
          query.studentId =
            req.query.studentId;
        }
      } else if (
        role ===
        "teacher"
      ) {
        const schoolId =
          getAuthenticatedSchoolId(
            req
          );

        if (!schoolId) {
          return res.status(
            403
          ).json({
            success:
              false,

            message:
              "Your school could not be identified."
          });
        }

        query.schoolId =
          schoolId;

        if (
          req.query.studentId &&
          isValidObjectId(
            req.query.studentId
          )
        ) {
          query.studentId =
            req.query.studentId;
        }
      } else {
        query.studentId =
          userId;
      }


      if (
        req.query.classId &&
        isValidObjectId(
          req.query.classId
        )
      ) {
        query.classId =
          req.query.classId;
      }


      if (
        req.query.saved ===
        "true"
      ) {
        query.saved =
          true;
      }


      if (
        req.query.attachmentType
      ) {
        query.attachmentType =
          String(
            req.query.attachmentType
          )
            .trim()
            .toLowerCase();
      }


      const resources =
        await StudentResource.find(
          query
        )
          .populate(
            "classId",
            "title name subject"
          )
          .populate(
            "studentId",
            "name email profileImage"
          )
          .sort({
            uploadedAt:
              -1,

            createdAt:
              -1
          });


      return res.json({
        success:
          true,

        resources
      });
    } catch (
      error
    ) {
      console.error(
        "GET /api/student-resources error:",
        error
      );

      return res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load student resources."
      });
    }
  }
);


/* =========================================================
   POST /api/student-resources
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !userCanUseResources(
          req
        )
      ) {
        return res.status(
          403
        ).json({
          success:
            false,

          message:
            "You are not allowed to create student resources."
        });
      }

      const userId =
        getAuthenticatedUserId(
          req
        );

      if (!userId) {
        return res.status(
          401
        ).json({
          success:
            false,

          message:
            "Your authenticated account could not be identified."
        });
      }


      const {
        title,
        description,
        url,
        secureUrl,
        publicId,
        originalName,
        mimeType,
        attachmentType,
        resourceType,
        size,
        format,
        width,
        height,
        classId,
        category,
        tags
      } =
        req.body;


      const cleanTitle =
        String(
          title ||
          originalName ||
          ""
        ).trim();

      const cleanUrl =
        String(
          secureUrl ||
          url ||
          ""
        ).trim();


      if (!cleanTitle) {
        return res.status(
          400
        ).json({
          success:
            false,

          message:
            "A resource title is required."
        });
      }


      if (!cleanUrl) {
        return res.status(
          400
        ).json({
          success:
            false,

          message:
            "A resource URL is required."
        });
      }


      const cleanClassId =
        isValidObjectId(
          classId
        )
          ? classId
          : null;


      const cleanCategory =
        ALLOWED_CATEGORIES.has(
          String(
            category ||
            ""
          )
            .trim()
            .toLowerCase()
        )
          ? String(
              category
            )
              .trim()
              .toLowerCase()
          : "note";


      const schoolId =
        getAuthenticatedSchoolId(
          req
        ) ||
        null;


      const resource =
        await StudentResource.create({
          studentId:
            userId,

          schoolId,

          classId:
            cleanClassId,

          title:
            cleanTitle,

          description:
            String(
              description ||
              ""
            ).trim(),

          url:
            cleanUrl,

          secureUrl:
            String(
              secureUrl ||
              cleanUrl
            ).trim(),

          publicId:
            String(
              publicId ||
              ""
            ).trim(),

          originalName:
            String(
              originalName ||
              cleanTitle
            ).trim(),

          mimeType:
            String(
              mimeType ||
              "application/octet-stream"
            )
              .trim()
              .toLowerCase(),

          attachmentType:
            String(
              attachmentType ||
              "file"
            )
              .trim()
              .toLowerCase(),

          resourceType:
            String(
              resourceType ||
              "raw"
            )
              .trim()
              .toLowerCase(),

          size:
            Math.max(
              0,
              Number(
                size
              ) ||
              0
            ),

          format:
            String(
              format ||
              ""
            ).trim(),

          width:
            Number.isFinite(
              Number(
                width
              )
            )
              ? Number(
                  width
                )
              : null,

          height:
            Number.isFinite(
              Number(
                height
              )
            )
              ? Number(
                  height
                )
              : null,

          category:
            cleanCategory,

          tags:
            sanitizeTags(
              tags
            ),

          uploadedAt:
            new Date()
        });


      const populated =
        await StudentResource.findById(
          resource._id
        )
          .populate(
            "classId",
            "title name subject"
          )
          .populate(
            "studentId",
            "name email profileImage"
          );


      return res.status(
        201
      ).json({
        success:
          true,

        resource:
          populated
      });
    } catch (
      error
    ) {
      console.error(
        "POST /api/student-resources error:",
        error
      );

      return res.status(
        500
      ).json({
        success:
          false,

        message:
          error?.message ||
          "Failed to create the student resource."
      });
    }
  }
);


/* =========================================================
   PATCH /api/student-resources/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const resource =
        await StudentResource.findById(
          req.params.id
        );

      if (!resource) {
        return res.status(
          404
        ).json({
          success:
            false,

          message:
            "Student resource not found."
        });
      }


      if (
        !canModifyResource(
          req,
          resource
        )
      ) {
        return res.status(
          403
        ).json({
          success:
            false,

          message:
            "You are not allowed to modify this resource."
        });
      }


      if (
        req.body.title !==
        undefined
      ) {
        const cleanTitle =
          String(
            req.body.title ||
            ""
          ).trim();

        if (!cleanTitle) {
          return res.status(
            400
          ).json({
            success:
              false,

            message:
              "The resource title cannot be empty."
          });
        }

        resource.title =
          cleanTitle;
      }


      if (
        req.body.description !==
        undefined
      ) {
        resource.description =
          String(
            req.body.description ||
            ""
          ).trim();
      }


      if (
        req.body.classId !==
        undefined
      ) {
        resource.classId =
          isValidObjectId(
            req.body.classId
          )
            ? req.body.classId
            : null;
      }


      if (
        req.body.category !==
        undefined
      ) {
        const category =
          String(
            req.body.category ||
            ""
          )
            .trim()
            .toLowerCase();

        if (
          !ALLOWED_CATEGORIES.has(
            category
          )
        ) {
          return res.status(
            400
          ).json({
            success:
              false,

            message:
              "Invalid resource category."
          });
        }

        resource.category =
          category;
      }


      if (
        req.body.tags !==
        undefined
      ) {
        resource.tags =
          sanitizeTags(
            req.body.tags
          );
      }


      if (
        req.body.saved !==
        undefined
      ) {
        resource.saved =
          Boolean(
            req.body.saved
          );
      }


      await resource.save();


      const populated =
        await StudentResource.findById(
          resource._id
        )
          .populate(
            "classId",
            "title name subject"
          )
          .populate(
            "studentId",
            "name email profileImage"
          );


      return res.json({
        success:
          true,

        resource:
          populated
      });
    } catch (
      error
    ) {
      console.error(
        "PATCH /api/student-resources/:id error:",
        error
      );

      return res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to update the student resource."
      });
    }
  }
);


/* =========================================================
   DELETE /api/student-resources/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const resource =
        await StudentResource.findById(
          req.params.id
        );

      if (!resource) {
        return res.status(
          404
        ).json({
          success:
            false,

          message:
            "Student resource not found."
        });
      }


      if (
        !canModifyResource(
          req,
          resource
        )
      ) {
        return res.status(
          403
        ).json({
          success:
            false,

          message:
            "You are not allowed to delete this resource."
        });
      }


      await resource.deleteOne();


      return res.json({
        success:
          true,

        message:
          "Student resource deleted."
      });
    } catch (
      error
    ) {
      console.error(
        "DELETE /api/student-resources/:id error:",
        error
      );

      return res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to delete the student resource."
      });
    }
  }
);


module.exports =
  router;
