"use strict";

const mongoose = require("mongoose");

const AnalyticsEvent = require(
  "../models/AnalyticsEvent"
);

/*
==========================================================
VALID EVENT TYPES
==========================================================
*/

const VALID_EVENT_TYPES = new Set(
    AnalyticsEvent.ANALYTICS_EVENT_TYPES
);

/*
==========================================================
VALID ENTITY TYPES
==========================================================
*/

const VALID_ENTITY_TYPES = new Set(
    AnalyticsEvent.ANALYTICS_ENTITY_TYPES
);

/*
==========================================================
MAXIMUM METADATA SIZE
==========================================================
*/

const MAX_METADATA_KEYS = 30;

const MAX_METADATA_DEPTH = 5;

const MAX_STRING_LENGTH = 500;

/*
==========================================================
SAFE OBJECT CHECK
==========================================================
*/

function isPlainObject(value){

    if(
        value===null ||
        typeof value!=="object"
    ){
        return false;
    }

    return (
        Object.getPrototypeOf(value)===Object.prototype
    );
}

/*
==========================================================
RECURSIVE SANITIZER
==========================================================
*/

function sanitizeMetadata(
    value,
    depth=0
){

    if(depth>MAX_METADATA_DEPTH){
        return {};
    }

    if(Array.isArray(value)){

        return value
            .slice(0,50)
            .map(item=>sanitizeMetadata(item,depth+1));

    }

    if(isPlainObject(value)){

        const output={};

        Object.keys(value)
            .slice(0,MAX_METADATA_KEYS)
            .forEach(key=>{

                output[key]=sanitizeMetadata(
                    value[key],
                    depth+1
                );

            });

        return output;

    }

    if(typeof value==="string"){

        return value
            .trim()
            .slice(0,MAX_STRING_LENGTH);

    }

    if(
        typeof value==="number" &&
        Number.isFinite(value)
    ){
        return value;
    }

    if(typeof value==="boolean"){
        return value;
    }

    if(value instanceof Date){
        return value;
    }

    return null;

}

/*
==========================================================
VALIDATION MIDDLEWARE
==========================================================
*/

module.exports=function validateAnalyticsEvent(
    req,
    res,
    next
){

    try{

        const body=req.body||{};

        /*
        -----------------------------------
        SCHOOL
        -----------------------------------
        */

if (
  !body.schoolId ||
  !mongoose.Types.ObjectId.isValid(
    String(body.schoolId)
  )
) {
  return res.status(400).json({
    success: false,
    message:
      "A valid schoolId is required."
  });
}
if (
  body.entityId &&
  !mongoose.Types.ObjectId.isValid(
    String(body.entityId)
  )
) {
  return res.status(400).json({
    success: false,
    message:
      "A valid entityId is required."
  });
}

        /*
        -----------------------------------
        EVENT TYPE
        -----------------------------------
        */

        if(
            !VALID_EVENT_TYPES.has(
                body.eventType
            )
        ){

            return res.status(400).json({

                success:false,

                message:"Invalid analytics event."

            });

        }

        /*
        -----------------------------------
        ENTITY TYPE
        -----------------------------------
        */

        if(
            body.entityType &&
            !VALID_ENTITY_TYPES.has(
                body.entityType
            )
        ){

            return res.status(400).json({

                success:false,

                message:"Invalid entity type."

            });

        }
        

        /*
        -----------------------------------
        SANITIZE
        -----------------------------------
        */

body.metadata = sanitizeMetadata(
  body.metadata || {}
);

req.body = body;

/*
  Provide a controlled analytics payload to the controller.

  The controller prefers this object over the original
  request body.
*/
req.validatedAnalyticsEvent = {
  schoolId: body.schoolId,

  eventType: body.eventType,

  entityType:
    body.entityType ||
    "school",

  entityId:
    body.entityId ||
    null,

  source:
    req.analyticsContext?.source ||
    body.source ||
    "unknown",

  metadata:
    body.metadata
};

return next();

    }
    catch(error){

        console.error(
            "validateAnalyticsEvent:",
            error
        );

        return res.status(500).json({

            success:false,

            message:"Analytics validation failed."

        });

    }

};
