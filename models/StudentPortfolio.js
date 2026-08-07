const mongoose = require("mongoose");


const StudentPortfolioProjectSchema =
  new mongoose.Schema(
    {
      title:{
        type:String,
        trim:true,
        maxlength:150,
        default:""
      },

      description:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      category:{
        type:String,
        trim:true,
        maxlength:100,
        default:"Project"
      },

      imageUrl:{
        type:String,
        trim:true,
        default:""
      },

      fileUrl:{
        type:String,
        trim:true,
        default:""
      },

      completedAt:{
        type:Date,
        default:null
      },

      featured:{
        type:Boolean,
        default:true
      },

      sourceType:{
        type:String,
        enum:[
          "manual",
          "resource",
          "assignment",
          "certificate",
          "ai"
        ],
        default:"manual"
      },

      sourceId:{
        type:mongoose.Schema.Types.ObjectId,
        default:null
      },

      order:{
        type:Number,
        default:0
      }
    },
    {
      _id:true
    }
  );


const StudentPortfolioExperienceSchema =
  new mongoose.Schema(
    {
      title:{
        type:String,
        trim:true,
        maxlength:150,
        default:""
      },

      organization:{
        type:String,
        trim:true,
        maxlength:180,
        default:""
      },

      description:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      type:{
        type:String,
        enum:[
          "internship",
          "employment",
          "volunteer",
          "competition",
          "leadership",
          "organization",
          "project",
          "other"
        ],
        default:"other"
      },

      startDate:{
        type:Date,
        default:null
      },

      endDate:{
        type:Date,
        default:null
      },

      current:{
        type:Boolean,
        default:false
      },

      order:{
        type:Number,
        default:0
      }
    },
    {
      _id:true
    }
  );


const StudentPortfolioSchema =
  new mongoose.Schema(
    {
      studentId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        unique:true,
        index:true
      },

      schoolId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null,
        index:true
      },

      visibility:{
        type:String,
        enum:[
          "private",
          "school",
          "public"
        ],
        default:"private",
        index:true
      },

      headline:{
        type:String,
        trim:true,
        maxlength:160,
        default:""
      },

      about:{
        type:String,
        trim:true,
        maxlength:2000,
        default:""
      },

      careerInterest:{
        type:String,
        trim:true,
        maxlength:160,
        default:""
      },

      opportunityType:{
        type:String,
        trim:true,
        enum:[
          "",
          "internship",
          "part-time",
          "full-time",
          "freelance",
          "volunteer",
          "collaboration"
        ],
        default:""
      },

      skills:[
        {
          type:String,
          trim:true,
          maxlength:80
        }
      ],

      languages:[
        {
          type:String,
          trim:true,
          maxlength:80
        }
      ],

      projects:[
        StudentPortfolioProjectSchema
      ],

      experience:[
        StudentPortfolioExperienceSchema
      ],

      featuredCertificateIds:[
        {
          type:mongoose.Schema.Types.ObjectId,
          ref:"Certificate"
        }
      ],

      resume:{
        url:{
          type:String,
          trim:true,
          default:""
        },

        fileName:{
          type:String,
          trim:true,
          maxlength:255,
          default:""
        },

        mimeType:{
          type:String,
          trim:true,
          maxlength:150,
          default:""
        },

        uploadedAt:{
          type:Date,
          default:null
        }
      },

      publicSlug:{
        type:String,
        trim:true,
        lowercase:true,
        unique:true,
        sparse:true,
        index:true
      },

      viewsCount:{
        type:Number,
        min:0,
        default:0
      },

      uniqueViewerIds:[
        {
          type:mongoose.Schema.Types.ObjectId,
          ref:"User"
        }
      ],

      lastPublishedAt:{
        type:Date,
        default:null
      },

      metadata:{
        type:mongoose.Schema.Types.Mixed,
        default:{}
      }
    },
    {
      timestamps:true
    }
  );


StudentPortfolioSchema.index(
  {
    schoolId:1,
    updatedAt:-1
  }
);


StudentPortfolioSchema.index(
  {
    visibility:1,
    updatedAt:-1
  }
);


module.exports =
  mongoose.model(
    "StudentPortfolio",
    StudentPortfolioSchema
  );
