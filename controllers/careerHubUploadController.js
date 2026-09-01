const cloudinary = require("../config/cloudinary");

const STUDENT_ROLES = new Set(["student","talent"]);

function role(req){
  return String(req.user?.role || "").trim().toLowerCase();
}

function safeName(value){
  return String(value || "document")
    .trim()
    .replace(/[\r\n\t]/g," ")
    .slice(0,300) || "document";
}

async function uploadCareerApplicationDocument(req,res){
  try{
    if(!STUDENT_ROLES.has(role(req))){
      return res.status(403).json({
        success:false,
        message:"Only Student or Talent accounts can upload Career Hub application documents."
      });
    }

    if(!req.file?.buffer){
      return res.status(400).json({success:false,message:"Choose a document to upload."});
    }

    const maxBytes=12 * 1024 * 1024;
    if(Number(req.file.size || 0) > maxBytes){
      return res.status(413).json({success:false,message:"Career Hub documents must be 12 MB or smaller."});
    }

    const result=await new Promise((resolve,reject)=>{
      const stream=cloudinary.uploader.upload_stream(
        {
          folder:"aift_career_applications",
          resource_type:"auto",
          type:"upload",
          access_mode:"public",
          use_filename:true,
          unique_filename:true,
          overwrite:false
        },
        (error,output)=>error ? reject(error) : resolve(output)
      );
      stream.end(req.file.buffer);
    });

    const document={
      name:safeName(req.body?.name || req.file.originalname),
      url:String(result.secure_url || result.url || ""),
      publicId:String(result.public_id || ""),
      mimeType:String(req.file.mimetype || result.format || ""),
      size:Number(req.file.size || 0),
      uploadedAt:new Date()
    };

    if(!document.url){
      return res.status(500).json({success:false,message:"The document uploaded but AIFT could not obtain a secure file URL."});
    }

    return res.status(201).json({success:true,document,item:document});
  }catch(error){
    console.error("CAREER HUB DOCUMENT UPLOAD ERROR:",error);
    return res.status(500).json({success:false,message:"AIFT could not upload this Career Hub document."});
  }
}

module.exports={uploadCareerApplicationDocument};
