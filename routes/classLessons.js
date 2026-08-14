const express =
  require("express");


const router =
  express.Router();


const auth =
  require("../middleware/auth");


const upload =
  require("../middleware/upload");


const cloudinary =
  require("../config/cloudinary");


const ClassLesson =
  require("../models/ClassLesson");


const Class =
  require("../models/Class");


/* =========================================================
   ROLE + ID HELPERS
========================================================= */

function normalizeRole(value) {

  const role =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  const aliases = {

    administrator:
      "admin",

    instructor:
      "teacher",

    faculty:
      "teacher",

    learner:
      "student"

  };


  return (
    aliases[role] ||
    role
  );

}


function normalizeObjectId(value) {

  if (!value) {
    return "";
  }


  if (
    typeof value ===
      "object" &&
    value._id
  ) {

    return String(
      value._id
    );

  }


  return String(value);

}


function getUserSchoolIds(user) {

  if (!user) {
    return [];
  }


  const role =
    normalizeRole(
      user.role
    );


  const values = [

    user.schoolId,

    user.linkedSchoolId

  ];


  if (
    role ===
    "school"
  ) {

    values.push(
      user._id
    );

  }


  return [
    ...new Set(
      values
        .map(
          normalizeObjectId
        )
        .filter(Boolean)
    )
  ];

}


/* =========================================================
   CLASS VIEW PERMISSION
========================================================= */

function canViewClass(
  user,
  classDoc
) {

  if (
    !user ||
    !classDoc
  ) {
    return false;
  }


  const role =
    normalizeRole(
      user.role
    );


  const userId =
    normalizeObjectId(
      user._id
    );


  const schoolId =
    normalizeObjectId(
      classDoc.schoolId
    );


  const teacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  const studentIds =
    Array.isArray(
      classDoc.studentIds
    )
      ? classDoc.studentIds
          .map(
            normalizeObjectId
          )
          .filter(Boolean)
      : [];


  if (
    role ===
    "admin"
  ) {
    return true;
  }


  if (
    role ===
    "school"
  ) {

    return getUserSchoolIds(
      user
    ).includes(
      schoolId
    );

  }


  if (
    role ===
    "teacher"
  ) {

    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId ===
        teacherId
    );

  }


  if (
    role ===
    "student"
  ) {

    return (
      Boolean(userId) &&
      studentIds.includes(
        userId
      )
    );

  }


  return false;

}


/* =========================================================
   CLASS INSTRUCTION PERMISSION
========================================================= */

function canManageAssignedClass(
  user,
  classDoc
) {

  if (
    !user ||
    !classDoc
  ) {
    return false;
  }


  const role =
    normalizeRole(
      user.role
    );


  const userId =
    normalizeObjectId(
      user._id
    );


  const schoolId =
    normalizeObjectId(
      classDoc.schoolId
    );


  const teacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  /*
    ADMIN
  */

  if (
    role ===
    "admin"
  ) {
    return true;
  }


  /*
    SCHOOL OWNER
  */

  if (
    role ===
    "school"
  ) {

    return getUserSchoolIds(
      user
    ).includes(
      schoolId
    );

  }


  /*
    ASSIGNED TEACHER ONLY
  */

  if (
    role ===
    "teacher"
  ) {

    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId ===
        teacherId
    );

  }


  return false;

}


/* =========================================================
   SAFE FIELD PICKER
========================================================= */

function pick(
  object,
  fields
) {

  const output = {};


  fields.forEach(
    field => {

      if (
        object[field] !==
        undefined
      ) {

        output[field] =
          object[field];

      }

    }
  );


  return output;

}

/* =========================================================
   CLASS LESSON RESOURCE UPLOAD ENGINE
========================================================= */

const CLASS_LESSON_RESOURCE_MAX_SIZE =
  100 * 1024 * 1024;


const CLASS_LESSON_RESOURCE_EXTENSIONS =
  new Set([
    /* IMAGES */
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",

    /* VIDEO */
    "mp4",
    "webm",
    "mov",
    "m4v",

    /* AUDIO */
    "mp3",
    "wav",
    "m4a",
    "ogg",
    "aac",

    /* DOCUMENT */
    "pdf",
    "doc",
    "docx",
    "txt",
    "rtf",
    "csv",

    /* PRESENTATION */
    "ppt",
    "pptx",

    /* SPREADSHEET */
    "xls",
    "xlsx",

    /* ARCHIVE */
    "zip"
  ]);


/* =========================================================
   FILE EXTENSION
========================================================= */

function getClassLessonResourceExtension(
  filename
) {

  const value =
    String(
      filename ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !value.includes(".")
  ) {

    return "";

  }


  return value
    .split(".")
    .pop()
    .trim();

}


/* =========================================================
   RESOURCE CATEGORY FROM FILE
========================================================= */

function getClassLessonResourceType(
  file
) {

  const mimeType =
    String(
      file?.mimetype ||
      ""
    )
      .trim()
      .toLowerCase();


  const extension =
    getClassLessonResourceExtension(
      file?.originalname
    );


  if (
    mimeType.startsWith(
      "image/"
    )
  ) {

    return "image";

  }


  if (
    mimeType.startsWith(
      "video/"
    )
  ) {

    return "video";

  }


  if (
    mimeType.startsWith(
      "audio/"
    )
  ) {

    return "audio";

  }


  if (
    extension ===
    "pdf"
  ) {

    return "pdf";

  }


  if (
    [
      "ppt",
      "pptx"
    ].includes(
      extension
    )
  ) {

    return "presentation";

  }


  if (
    [
      "xls",
      "xlsx",
      "csv"
    ].includes(
      extension
    )
  ) {

    return "spreadsheet";

  }


  if (
    [
      "doc",
      "docx",
      "txt",
      "rtf"
    ].includes(
      extension
    )
  ) {

    return "document";

  }


  if (
    extension ===
    "zip"
  ) {

    return "archive";

  }


  return "file";

}


/* =========================================================
   RESOURCE FILE VALIDATION
========================================================= */

function validateClassLessonResourceFile(
  file
) {

  if (!file) {

    return true;

  }


  const fileSize =
    Number(
      file.size ||
      0
    );


  if (
    fileSize >
    CLASS_LESSON_RESOURCE_MAX_SIZE
  ) {

    const error =
      new Error(
        "Resource file exceeds the 100 MB limit."
      );


    error.status =
      413;


    throw error;

  }


  const extension =
    getClassLessonResourceExtension(
      file.originalname
    );


  if (
    !CLASS_LESSON_RESOURCE_EXTENSIONS
      .has(
        extension
      )
  ) {

    const error =
      new Error(
        "This resource file type is not supported."
      );


    error.status =
      400;


    throw error;

  }


  return true;

}


/* =========================================================
   SAFE RESOURCE FILE NAME
========================================================= */

function getClassLessonResourceBaseName(
  filename
) {

  return (
    String(
      filename ||
      "resource"
    )
      .replace(
        /\.[^/.]+$/,
        ""
      )
      .replace(
        /[^a-zA-Z0-9_-]+/g,
        "-"
      )
      .replace(
        /^[-_]+|[-_]+$/g,
        ""
      )
      .slice(
        0,
        80
      ) ||
    "resource"
  );

}


/* =========================================================
   CLOUDINARY RESOURCE UPLOAD
========================================================= */

function uploadClassLessonResource(
  file
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      if (!file) {

        resolve(
          null
        );

        return;

      }


      try {

        validateClassLessonResourceFile(
          file
        );

      } catch (error) {

        reject(
          error
        );

        return;

      }


      const extension =
        getClassLessonResourceExtension(
          file.originalname
        );


      const baseName =
        getClassLessonResourceBaseName(
          file.originalname
        );


      const uploadStream =
        cloudinary
          .uploader
          .upload_stream(
            {

              folder:
                "aift_class_resources",


              resource_type:
                "auto",


              use_filename:
                true,


              unique_filename:
                true,


              filename_override:
                extension
                  ? `${baseName}.${extension}`
                  : baseName

            },
            (
              error,
              result
            ) => {

              if (error) {

                reject(
                  error
                );

                return;

              }


              resolve({

                url:
                  result.secure_url,


                secureUrl:
                  result.secure_url,


                publicId:
                  result.public_id,


                resourceType:
                  result.resource_type ||
                  "",


                format:
                  result.format ||
                  extension ||
                  "",


                size:
                  Number(
                    result.bytes ||
                    file.size ||
                    0
                  ),


                originalName:
                  file.originalname ||
                  "Resource",


                mimeType:
                  file.mimetype ||
                  "application/octet-stream",


                width:
                  Number.isFinite(
                    Number(
                      result.width
                    )
                  )
                    ? Number(
                        result.width
                      )
                    : null,


                height:
                  Number.isFinite(
                    Number(
                      result.height
                    )
                  )
                    ? Number(
                        result.height
                      )
                    : null,


                duration:
                  Number.isFinite(
                    Number(
                      result.duration
                    )
                  )
                    ? Number(
                        result.duration
                      )
                    : null

              });

            }
          );


      uploadStream.end(
        file.buffer
      );

    }
  );

}


/* =========================================================
   SAFE EXTERNAL RESOURCE URL
========================================================= */

function normalizeClassLessonResourceUrl(
  value
) {

  const input =
    String(
      value ||
      ""
    )
      .trim();


  if (!input) {

    return "";

  }


  let parsed;


  try {

    parsed =
      new URL(
        input
      );

  } catch {

    return "";

  }


  if (
    ![
      "http:",
      "https:"
    ].includes(
      parsed.protocol
    )
  ) {

    return "";

  }


  return parsed.href;

}


/* =========================================================
   CLOUDINARY RESOURCE DELETE
========================================================= */

async function deleteClassLessonCloudinaryResource(
  resource
) {

  const publicId =
    String(
      resource?.publicId ||
      ""
    )
      .trim();


  if (!publicId) {

    return false;

  }


  const resourceType =
    String(
      resource?.resourceType ||
      "image"
    )
      .trim()
      .toLowerCase();


  try {

    await cloudinary
      .uploader
      .destroy(
        publicId,
        {
          resource_type:
            [
              "image",
              "video",
              "raw"
            ].includes(
              resourceType
            )
              ? resourceType
              : "image",

          invalidate:
            true
        }
      );


    return true;

  } catch (error) {

    /*
      Do not destroy the database request because Cloudinary
      cleanup failed.

      The database resource can still be removed and the
      failure remains visible in server logs for maintenance.
    */

    console.error(
      "Cloudinary class resource delete error:",
      error
    );


    return false;

  }

}


/* =========================================================
   GET CLASS LESSONS

   GET /api/class-lessons
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const {
        classId,
        moduleId,
        schoolId,
        status
      } = req.query;


      const role =
        normalizeRole(
          req.user.role
        );


      const query = {};


      /* =====================================================
         CLASS-SCOPED REQUEST
      ===================================================== */

      if (classId) {

        const classDoc =
          await Class.findById(
            classId
          )
            .select(
              "schoolId teacherId studentIds"
            )
            .lean();


        if (!classDoc) {

          return res
            .status(404)
            .json({
              message:
                "Class not found"
            });

        }


        if (
          !canViewClass(
            req.user,
            classDoc
          )
        ) {

          return res
            .status(403)
            .json({
              message:
                "Not allowed to view lessons for this class"
            });

        }


        query.classId =
          classId;


        /*
          Students can never retrieve draft
          or archived lessons through this API.
        */

        if (
          role ===
          "student"
        ) {

          query.status =
            "published";

        } else if (status) {

          query.status =
            status;

        }

      } else {

        /* ===================================================
           NON CLASS-SCOPED REQUEST

           Keep results scoped to the authenticated account.
        =================================================== */

        if (
          role ===
          "admin"
        ) {

          if (schoolId) {

            query.schoolId =
              schoolId;

          }

        } else if (
          role ===
          "school"
        ) {

          query.schoolId =
            normalizeObjectId(
              req.user._id
            );

        } else if (
          role ===
          "teacher"
        ) {

          const classes =
            await Class.find({
              teacherId:
                req.user._id
            })
              .select("_id")
              .lean();


          query.classId = {
            $in:
              classes.map(
                item =>
                  item._id
              )
          };


          if (status) {

            query.status =
              status;

          }

        } else if (
          role ===
          "student"
        ) {

          const classes =
            await Class.find({
              studentIds:
                req.user._id
            })
              .select("_id")
              .lean();


          query.classId = {
            $in:
              classes.map(
                item =>
                  item._id
              )
          };


          query.status =
            "published";

        } else {

          return res
            .status(403)
            .json({
              message:
                "Not allowed to view class lessons"
            });

        }

      }


      if (moduleId) {

        query.moduleId =
          moduleId;

      }


      const lessons =
        await ClassLesson.find(
          query
        )
          .sort({
            order:1,
            createdAt:1
          })
          .lean();


      return res.json(
        lessons
      );


    } catch (err) {

      console.error(
        "GET class lessons error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load class lessons"
        });

    }

  }
);


/* =========================================================
   CREATE CLASS LESSON

   POST /api/class-lessons
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const {
        classId,
        title
      } = req.body;


      if (
        !classId ||
        !String(
          title ||
          ""
        ).trim()
      ) {

        return res
          .status(400)
          .json({
            message:
              "classId and title are required"
          });

      }


      const classDoc =
        await Class.findById(
          classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to create lessons for this class"
          });

      }


      /*
        IMPORTANT:

        schoolId is taken from the actual class,
        not trusted from req.body.
      */

      const lesson =
        await ClassLesson.create({

          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          moduleId:
            req.body.moduleId ||
            null,

          title:
            String(
              title
            ).trim(),

          summary:
            req.body.summary ||
            "",

          content:
            req.body.content ||
            "",

          videoUrl:
            req.body.videoUrl ||
            "",

          coverUrl:
            req.body.coverUrl ||
            "",

          resources:
            Array.isArray(
              req.body.resources
            )
              ? req.body.resources
              : [],

          order:
            Number(
              req.body.order ||
              0
            ),

          durationMinutes:
            Number(
              req.body
                .durationMinutes ||
              0
            ),

          status:
            [
              "draft",
              "published",
              "archived"
            ].includes(
              req.body.status
            )
              ? req.body.status
              : "draft",

          previewEnabled:
            Boolean(
              req.body
                .previewEnabled
            )

        });


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "lesson:new",
            lesson
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "lesson:new",
              lesson
            );

        }

      }


      return res
        .status(201)
        .json(
          lesson
        );


    } catch (err) {

      console.error(
        "POST class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to create class lesson"
        });

    }

  }
);


/* =========================================================
   UPDATE CLASS LESSON

   PATCH /api/class-lessons/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const lesson =
        await ClassLesson.findById(
          req.params.id
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      const classDoc =
        await Class.findById(
          lesson.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this lesson"
          });

      }


      const updates =
        pick(
          req.body,
          [
            "moduleId",
            "title",
            "summary",
            "content",
            "videoUrl",
            "coverUrl",
            "resources",
            "order",
            "durationMinutes",
            "status",
            "previewEnabled"
          ]
        );


      /*
        Immutable ownership fields cannot be changed
        through this endpoint.

        schoolId and classId remain tied to the
        original class.
      */

      Object.entries(
        updates
      ).forEach(
        ([
          field,
          value
        ]) => {

          lesson[field] =
            value;

        }
      );


      await lesson.save();


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "lesson:updated",
            lesson
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "lesson:updated",
              lesson
            );

        }

      }


      return res.json(
        lesson
      );


    } catch (err) {

      console.error(
        "PATCH class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to update class lesson"
        });

    }

  }
);


/* =========================================================
   ADD CLASS LESSON RESOURCE

   POST /api/class-lessons/:id/resources

   multipart/form-data

   Supported modes:

   DEVICE UPLOAD
     file
     title
     description

   EXTERNAL LINK
     url
     title
     description

   PERMISSIONS
   ---------------------------------------------------------

   Admin:
     authorized

   School:
     lesson must belong to its School

   Teacher:
     must currently be assigned to the lesson's Class

   Student:
     never allowed
========================================================= */

router.post(
  "/:id/resources",

  auth,

  upload.single(
    "file"
  ),

  async (
    req,
    res
  ) => {

    try {

      /* =====================================================
         LESSON
      ===================================================== */

      const lesson =
        await ClassLesson.findById(
          req.params.id
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      /* =====================================================
         CLASS + AUTHORIZATION
      ===================================================== */

      const classDoc =
        await Class.findById(
          lesson.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to add resources to this lesson"
          });

      }


      /* =====================================================
         INPUT
      ===================================================== */

      const title =
        String(
          req.body.title ||
          ""
        )
          .trim()
          .slice(
            0,
            255
          );


      const description =
        String(
          req.body.description ||
          ""
        )
          .trim()
          .slice(
            0,
            2000
          );


      const externalUrl =
        normalizeClassLessonResourceUrl(
          req.body.url
        );


      /* =====================================================
         REQUIRE FILE OR URL
      ===================================================== */

      if (
        !req.file &&
        !externalUrl
      ) {

        return res
          .status(400)
          .json({
            message:
              "Choose a file from your device or provide a valid resource URL."
          });

      }


      /* =====================================================
         DEVICE FILE
      ===================================================== */

      let resource;


      if (
        req.file
      ) {

        validateClassLessonResourceFile(
          req.file
        );


        const uploaded =
          await uploadClassLessonResource(
            req.file
          );


        resource = {

          title:
            title ||
            req.file.originalname ||
            "Resource",


          description,


          url:
            uploaded.url,


          secureUrl:
            uploaded.secureUrl,


          type:
            getClassLessonResourceType(
              req.file
            ),


          source:
            "upload",


          originalName:
            uploaded.originalName,


          mimeType:
            uploaded.mimeType,


          size:
            uploaded.size,


          format:
            uploaded.format,


          publicId:
            uploaded.publicId,


          resourceType:
            uploaded.resourceType,


          width:
            uploaded.width,


          height:
            uploaded.height,


          duration:
            uploaded.duration,


          uploadedBy:
            req.user._id,


          uploadedAt:
            new Date()

        };

      }


      /* =====================================================
         EXTERNAL LINK
      ===================================================== */

      else {

        resource = {

          title:
            title ||
            "External resource",


          description,


          url:
            externalUrl,


          secureUrl:
            externalUrl,


          type:
            "link",


          source:
            "link",


          originalName:
            "",


          mimeType:
            "",


          size:
            0,


          format:
            "",


          publicId:
            "",


          resourceType:
            "",


          uploadedBy:
            req.user._id,


          uploadedAt:
            new Date()

        };

      }


      /* =====================================================
         PREVENT EXACT DUPLICATE URL
      ===================================================== */

      const duplicate =
        lesson.resources
          .some(
            existing => {

              const existingUrl =
                String(
                  existing?.url ||
                  ""
                )
                  .trim();


              return (
                existingUrl &&
                existingUrl ===
                  resource.url
              );

            }
          );


      if (
        duplicate
      ) {

        /*
          If we already uploaded the new file to Cloudinary,
          clean it up because it will not be stored.
        */

        if (
          resource.publicId
        ) {

          await deleteClassLessonCloudinaryResource(
            resource
          );

        }


        return res
          .status(409)
          .json({
            message:
              "This resource already exists in the lesson."
          });

      }


      /* =====================================================
         SAVE
      ===================================================== */

      lesson.resources.push(
        resource
      );


      await lesson.save();


      const savedResource =
        lesson.resources[
          lesson.resources.length -
          1
        ];


      /* =====================================================
         REALTIME
      ===================================================== */

      const io =
        req.app.get(
          "io"
        );


      if (io) {

        const payload = {

          lessonId:
            String(
              lesson._id
            ),


          classId:
            String(
              classDoc._id
            ),


          resource:
            savedResource

        };


        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "lesson:resource:new",
            payload
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "lesson:resource:new",
              payload
            );

        }

      }


      return res
        .status(201)
        .json({

          message:
            "Resource added successfully.",


          lessonId:
            String(
              lesson._id
            ),


          resource:
            savedResource

        });


    } catch (error) {

      console.error(
        "POST class lesson resource error:",
        error
      );


      const status =
        Number(
          error?.status
        ) ||
        (
          error?.code ===
          "LIMIT_FILE_SIZE"
            ? 413
            : 500
        );


      return res
        .status(
          status
        )
        .json({
          message:
            error?.message ||
            "Failed to add lesson resource"
        });

    }

  }
);


/* =========================================================
   DELETE ONE CLASS LESSON RESOURCE

   DELETE /api/class-lessons/:lessonId/resources/:resourceId
========================================================= */

router.delete(
  "/:lessonId/resources/:resourceId",

  auth,

  async (
    req,
    res
  ) => {

    try {

      const lesson =
        await ClassLesson.findById(
          req.params.lessonId
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      const classDoc =
        await Class.findById(
          lesson.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to remove resources from this lesson"
          });

      }


      const resource =
        lesson.resources.id(
          req.params.resourceId
        );


      if (!resource) {

        return res
          .status(404)
          .json({
            message:
              "Resource not found"
          });

      }


      /*
        Preserve metadata before removing the nested document.
      */

      const resourceSnapshot =
        resource.toObject
          ? resource.toObject()
          : {
              ...resource
            };


      /* =====================================================
         DELETE DATABASE RECORD
      ===================================================== */

      resource.deleteOne();


      await lesson.save();


      /* =====================================================
         DELETE CLOUDINARY OBJECT

         External links have no publicId and are ignored.
      ===================================================== */

      if (
        resourceSnapshot.publicId
      ) {

        await deleteClassLessonCloudinaryResource(
          resourceSnapshot
        );

      }


      /* =====================================================
         REALTIME
      ===================================================== */

      const io =
        req.app.get(
          "io"
        );


      if (io) {

        const payload = {

          lessonId:
            String(
              lesson._id
            ),


          classId:
            String(
              classDoc._id
            ),


          resourceId:
            String(
              req.params.resourceId
            )

        };


        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "lesson:resource:deleted",
            payload
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "lesson:resource:deleted",
              payload
            );

        }

      }


      return res.json({

        message:
          "Resource removed successfully.",


        lessonId:
          String(
            lesson._id
          ),


        resourceId:
          String(
            req.params.resourceId
          )

      });


    } catch (error) {

      console.error(
        "DELETE class lesson resource error:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to remove lesson resource"
        });

    }

  }
);

/* =========================================================
   DELETE CLASS LESSON

   DELETE /api/class-lessons/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const lesson =
        await ClassLesson.findById(
          req.params.id
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      const classDoc =
        await Class.findById(
          lesson.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to delete this lesson"
          });

      }


      const lessonId =
        lesson._id;


      await lesson.deleteOne();


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        const payload = {

          lessonId:
            String(
              lessonId
            ),

          classId:
            String(
              classDoc._id
            )

        };


        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "lesson:deleted",
            payload
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "lesson:deleted",
              payload
            );

        }

      }


      return res.json({

        message:
          "Class lesson deleted",

        lessonId:
          String(
            lessonId
          )

      });


    } catch (err) {

      console.error(
        "DELETE class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to delete class lesson"
        });

    }

  }
);


module.exports =
  router;
