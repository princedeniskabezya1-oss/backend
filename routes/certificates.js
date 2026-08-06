const express =
  require("express");

const crypto =
  require("crypto");

const mongoose =
  require("mongoose");

const auth =
  require("../middleware/auth");

const Certificate =
  require("../models/Certificate");


const router =
  express.Router();


/* =========================================================
   HELPERS
========================================================= */

function normalizeObjectId(
  value
){

  if (!value){
    return null;
  }


  const normalized =
    typeof value === "object"
      ? (
          value._id ||
          value.id ||
          value
        )
      : value;


  return mongoose.Types.ObjectId
    .isValid(
      String(normalized)
    )
      ? String(normalized)
      : null;

}


function sameId(
  left,
  right
){

  const normalizedLeft =
    normalizeObjectId(
      left
    );

  const normalizedRight =
    normalizeObjectId(
      right
    );


  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    normalizedLeft ===
      normalizedRight
  );

}


function getUserSchoolId(
  user
){

  if (!user){
    return null;
  }


  if (
    String(
      user.role ||
      ""
    ).toLowerCase() ===
      "school"
  ){

    return normalizeObjectId(
      user._id
    );

  }


  return normalizeObjectId(
    user.schoolId ||
    user.linkedSchoolId ||
    user.companyId
  );

}


function buildCertificateCode(
  prefix
){

  const randomPart =
    crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase();


  return `${
    String(
      prefix ||
      "AIFT"
    )
      .trim()
      .toUpperCase()
  }-${Date.now()}-${randomPart}`;

}


function sanitizeCertificate(
  certificate
){

  if (!certificate){
    return null;
  }


  const value =
    typeof certificate.toObject ===
      "function"
      ? certificate.toObject()
      : certificate;


  return {
    ...value,

    id:
      String(
        value._id ||
        value.id ||
        ""
      )
  };

}


function canReadCertificate(
  user,
  certificate
){

  const role =
    String(
      user?.role ||
      ""
    ).toLowerCase();


  if (role === "admin"){
    return true;
  }


  if (
    role === "student" ||
    role === "talent"
  ){

    return sameId(
      certificate.studentId,
      user._id
    );

  }


  if (role === "school"){

    return sameId(
      certificate.schoolId,
      user._id
    );

  }


  if (role === "teacher"){

    return (
      sameId(
        certificate.teacherId,
        user._id
      ) ||
      sameId(
        certificate.issuedBy,
        user._id
      )
    );

  }


  return false;

}


function canIssueCertificate(
  user,
  schoolId
){

  const role =
    String(
      user?.role ||
      ""
    ).toLowerCase();


  if (role === "admin"){
    return true;
  }


  if (role === "school"){

    return sameId(
      user._id,
      schoolId
    );

  }


  if (role === "teacher"){

    const teacherSchoolId =
      getUserSchoolId(
        user
      );


    return sameId(
      teacherSchoolId,
      schoolId
    );

  }


  return false;

}


/* =========================================================
   GET CURRENT STUDENT CERTIFICATES
   GET /api/certificates/my
========================================================= */

router.get(
  "/my",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const role =
        String(
          req.user?.role ||
          ""
        ).toLowerCase();


      if (
        ![
          "student",
          "talent",
          "admin"
        ].includes(
          role
        )
      ){

        return res.status(403).json({
          message:
            "Only student accounts may access this certificate list."
        });

      }


      const studentId =
        role === "admin" &&
        req.query.studentId
          ? normalizeObjectId(
              req.query.studentId
            )
          : normalizeObjectId(
              req.user._id
            );


      if (!studentId){

        return res.status(400).json({
          message:
            "The student account could not be identified."
        });

      }


      const query = {
        studentId
      };


      if (
        req.query.status &&
        req.query.status !==
          "all"
      ){

        query.status =
          String(
            req.query.status
          )
            .trim()
            .toLowerCase();

      }


      const certificates =
        await Certificate
          .find(query)
          .populate(
            "schoolId",
            "name email profileImage logo"
          )
          .populate(
            "studentId",
            "name email profileImage course program"
          )
          .populate(
            "teacherId",
            "name email profileImage"
          )
          .populate(
            "issuedBy",
            "name email profileImage role"
          )
          .populate(
            "classId",
            "title name subject classCode"
          )
          .sort({
            issuedAt:-1,
            createdAt:-1
          })
          .lean();


      return res.json({
        certificates:
          certificates.map(
            sanitizeCertificate
          )
      });

    }catch(error){

      console.error(
        "GET /api/certificates/my failed:",
        error
      );


      return res.status(500).json({
        message:
          "AIFT could not load your certificates."
      });

    }

  }
);


/* =========================================================
   GET ONE AUTHENTICATED CERTIFICATE
   GET /api/certificates/:id
========================================================= */

router.get(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ){

        return res.status(400).json({
          message:
            "The certificate ID is invalid."
        });

      }


      const certificate =
        await Certificate
          .findById(
            req.params.id
          )
          .populate(
            "schoolId",
            "name email profileImage logo"
          )
          .populate(
            "studentId",
            "name email profileImage course program"
          )
          .populate(
            "teacherId",
            "name email profileImage"
          )
          .populate(
            "issuedBy",
            "name email profileImage role"
          )
          .populate(
            "classId",
            "title name subject classCode"
          );


      if (!certificate){

        return res.status(404).json({
          message:
            "Certificate not found."
        });

      }


      if (
        !canReadCertificate(
          req.user,
          certificate
        )
      ){

        return res.status(403).json({
          message:
            "You are not allowed to view this certificate."
        });

      }


      return res.json({
        certificate:
          sanitizeCertificate(
            certificate
          )
      });

    }catch(error){

      console.error(
        "GET /api/certificates/:id failed:",
        error
      );


      return res.status(500).json({
        message:
          "AIFT could not load this certificate."
      });

    }

  }
);


/* =========================================================
   PUBLIC CERTIFICATE VERIFICATION
   GET /api/certificates/verify/:code
========================================================= */

router.get(
  "/verify/:code",
  async (
    req,
    res
  ) => {

    try{

      const code =
        String(
          req.params.code ||
          ""
        )
          .trim()
          .toUpperCase();


      if (!code){

        return res.status(400).json({
          verified:false,

          message:
            "A certificate verification code is required."
        });

      }


      const certificate =
        await Certificate
          .findOne({
            $or:[
              {
                verificationCode:
                  code
              },
              {
                certificateNumber:
                  code
              }
            ]
          })
          .populate(
            "schoolId",
            "name profileImage logo"
          )
          .populate(
            "studentId",
            "name profileImage"
          )
          .populate(
            "classId",
            "title name subject classCode"
          )
          .lean();


      if (!certificate){

        return res.status(404).json({
          verified:false,

          message:
            "No certificate matches this verification code."
        });

      }


      const now =
        Date.now();


      const expired =
        Boolean(
          certificate.expiresAt &&
          new Date(
            certificate.expiresAt
          ).getTime() <
            now
        );


      const verified =
        certificate.status ===
          "verified" &&
        !expired;


      return res.json({
        verified,

        certificate:{
          id:
            String(
              certificate._id
            ),

          title:
            certificate.title,

          studentName:
            certificate.studentName ||
            certificate.studentId?.name ||
            "",

          schoolName:
            certificate.schoolName ||
            certificate.schoolId?.name ||
            "",

          className:
            certificate.className ||
            certificate.classId?.title ||
            certificate.classId?.name ||
            "",

          programName:
            certificate.programName ||
            "",

          certificateNumber:
            certificate.certificateNumber,

          verificationCode:
            certificate.verificationCode,

          status:
            expired
              ? "expired"
              : certificate.status,

          issuedAt:
            certificate.issuedAt,

          completedAt:
            certificate.completedAt,

          expiresAt:
            certificate.expiresAt,

          grade:
            certificate.grade,

          score:
            certificate.score,

          hours:
            certificate.hours,

          skills:
            certificate.skills
        }
      });

    }catch(error){

      console.error(
        "GET /api/certificates/verify/:code failed:",
        error
      );


      return res.status(500).json({
        verified:false,

        message:
          "AIFT could not verify this certificate."
      });

    }

  }
);


/* =========================================================
   CREATE CERTIFICATE
   POST /api/certificates
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const schoolId =
        normalizeObjectId(
          req.body.schoolId ||
          getUserSchoolId(
            req.user
          )
        );


      const studentId =
        normalizeObjectId(
          req.body.studentId
        );


      if (
        !schoolId ||
        !studentId
      ){

        return res.status(400).json({
          message:
            "schoolId and studentId are required."
        });

      }


      if (
        !canIssueCertificate(
          req.user,
          schoolId
        )
      ){

        return res.status(403).json({
          message:
            "You are not allowed to issue certificates for this school."
        });

      }


      const certificateNumber =
        String(
          req.body.certificateNumber ||
          buildCertificateCode(
            "AIFT-CERT"
          )
        )
          .trim()
          .toUpperCase();


      const verificationCode =
        String(
          req.body.verificationCode ||
          buildCertificateCode(
            "VERIFY"
          )
        )
          .trim()
          .toUpperCase();


      const certificate =
        await Certificate.create({
          schoolId,

          studentId,

          teacherId:
            normalizeObjectId(
              req.body.teacherId
            ) ||
            (
              String(
                req.user.role ||
                ""
              ).toLowerCase() ===
                "teacher"
                ? req.user._id
                : null
            ),

          classId:
            normalizeObjectId(
              req.body.classId
            ),

          programId:
            normalizeObjectId(
              req.body.programId
            ),

          title:
            String(
              req.body.title ||
              "Certificate of Completion"
            ).trim(),

          description:
            String(
              req.body.description ||
              ""
            ).trim(),

          programName:
            String(
              req.body.programName ||
              ""
            ).trim(),

          className:
            String(
              req.body.className ||
              ""
            ).trim(),

          studentName:
            String(
              req.body.studentName ||
              ""
            ).trim(),

          schoolName:
            String(
              req.body.schoolName ||
              ""
            ).trim(),

          certificateNumber,

          verificationCode,

          status:
            String(
              req.body.status ||
              "pending"
            )
              .trim()
              .toLowerCase(),

          grade:
            String(
              req.body.grade ||
              ""
            ).trim(),

          score:
            req.body.score ===
              undefined ||
            req.body.score ===
              null ||
            req.body.score ===
              ""
              ? null
              : Number(
                  req.body.score
                ),

          hours:
            Number(
              req.body.hours ||
              0
            ),

          skills:
            Array.isArray(
              req.body.skills
            )
              ? req.body.skills
                  .map(skill => ({
                    name:
                      typeof skill ===
                        "string"
                        ? skill.trim()
                        : String(
                            skill?.name ||
                            skill?.title ||
                            ""
                          ).trim()
                  }))
                  .filter(skill =>
                    Boolean(
                      skill.name
                    )
                  )
              : [],

          issuedAt:
            req.body.issuedAt ||
            null,

          completedAt:
            req.body.completedAt ||
            null,

          expiresAt:
            req.body.expiresAt ||
            null,

          pdfUrl:
            String(
              req.body.pdfUrl ||
              ""
            ).trim(),

          previewUrl:
            String(
              req.body.previewUrl ||
              ""
            ).trim(),

          templateId:
            normalizeObjectId(
              req.body.templateId
            ),

          issuedBy:
            req.user._id,

          metadata:
            req.body.metadata &&
            typeof req.body.metadata ===
              "object"
              ? req.body.metadata
              : {}
        });


      return res.status(201).json({
        message:
          "Certificate created successfully.",

        certificate:
          sanitizeCertificate(
            certificate
          )
      });

    }catch(error){

      console.error(
        "POST /api/certificates failed:",
        error
      );


      if (
        error?.code ===
        11000
      ){

        return res.status(409).json({
          message:
            "The certificate number or verification code already exists."
        });

      }


      return res.status(500).json({
        message:
          error?.message ||
          "AIFT could not create the certificate."
      });

    }

  }
);


/* =========================================================
   UPDATE CERTIFICATE
   PATCH /api/certificates/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ){

        return res.status(400).json({
          message:
            "The certificate ID is invalid."
        });

      }


      const certificate =
        await Certificate.findById(
          req.params.id
        );


      if (!certificate){

        return res.status(404).json({
          message:
            "Certificate not found."
        });

      }


      if (
        !canIssueCertificate(
          req.user,
          certificate.schoolId
        )
      ){

        return res.status(403).json({
          message:
            "You are not allowed to update this certificate."
        });

      }


      const allowedFields = [
        "title",
        "description",
        "programName",
        "className",
        "studentName",
        "schoolName",
        "status",
        "grade",
        "score",
        "hours",
        "issuedAt",
        "completedAt",
        "expiresAt",
        "pdfUrl",
        "previewUrl",
        "revokedReason",
        "metadata"
      ];


      allowedFields.forEach(
        field => {

          if (
            Object.prototype
              .hasOwnProperty
              .call(
                req.body,
                field
              )
          ){

            certificate[field] =
              req.body[field];

          }

        }
      );


      if (
        Array.isArray(
          req.body.skills
        )
      ){

        certificate.skills =
          req.body.skills
            .map(skill => ({
              name:
                typeof skill ===
                  "string"
                  ? skill.trim()
                  : String(
                      skill?.name ||
                      skill?.title ||
                      ""
                    ).trim()
            }))
            .filter(skill =>
              Boolean(
                skill.name
              )
            );

      }


      if (
        req.body.status ===
        "revoked"
      ){

        certificate.revokedBy =
          req.user._id;

        certificate.revokedAt =
          new Date();

      }


      await certificate.save();


      return res.json({
        message:
          "Certificate updated successfully.",

        certificate:
          sanitizeCertificate(
            certificate
          )
      });

    }catch(error){

      console.error(
        "PATCH /api/certificates/:id failed:",
        error
      );


      return res.status(500).json({
        message:
          error?.message ||
          "AIFT could not update the certificate."
      });

    }

  }
);


/* =========================================================
   DELETE CERTIFICATE
   DELETE /api/certificates/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ){

        return res.status(400).json({
          message:
            "The certificate ID is invalid."
        });

      }


      const certificate =
        await Certificate.findById(
          req.params.id
        );


      if (!certificate){

        return res.status(404).json({
          message:
            "Certificate not found."
        });

      }


      if (
        !canIssueCertificate(
          req.user,
          certificate.schoolId
        )
      ){

        return res.status(403).json({
          message:
            "You are not allowed to delete this certificate."
        });

      }


      await certificate.deleteOne();


      return res.json({
        message:
          "Certificate deleted successfully."
      });

    }catch(error){

      console.error(
        "DELETE /api/certificates/:id failed:",
        error
      );


      return res.status(500).json({
        message:
          "AIFT could not delete the certificate."
      });

    }

  }
);


module.exports =
  router;
