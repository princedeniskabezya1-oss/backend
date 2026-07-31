const mongoose = require("mongoose");

const questionOptionSchema = new mongoose.Schema(
{
    id:{
        type:String,
        default:()=>new mongoose.Types.ObjectId().toString()
    },

    text:{
        type:String,
        default:""
    },

    isCorrect:{
        type:Boolean,
        default:false
    }
},
{ _id:false }
);

const attachmentSchema = new mongoose.Schema(
{
    type:{
        type:String,
        enum:["image","video","audio","file"],
        required:true
    },

    url:{
        type:String,
        default:""
    },

    name:{
        type:String,
        default:""
    }
},
{ _id:false }
);

const versionSchema = new mongoose.Schema(
{
    version:{
        type:Number,
        required:true
    },

    updatedAt:{
        type:Date,
        default:Date.now
    },

    updatedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }
},
{ _id:false }
);

const questionBankSchema=new mongoose.Schema({

    schoolId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
    },

    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
    },

    title:{
        type:String,
        required:true,
        trim:true
    },

    question:{
        type:String,
        required:true
    },

    type:{
        type:String,
        enum:[
            "multiple_choice",
            "checkbox",
            "true_false",
            "essay",
            "short_answer",
            "matching",
            "ordering",
            "fill_blank",
            "coding"
        ],
        default:"multiple_choice"
    },

    options:{
        type:[questionOptionSchema],
        default:[]
    },

    explanation:{
        type:String,
        default:""
    },

    points:{
        type:Number,
        default:1
    },

    difficulty:{
        type:String,
        enum:[
            "easy",
            "medium",
            "hard"
        ],
        default:"medium"
    },

    bloom:{
        type:String,
        default:"remember"
    },

    category:{
        type:String,
        default:"General"
    },

    tags:{
        type:[String],
        default:[]
    },

    attachments:{
        type:[attachmentSchema],
        default:[]
    },

    aiGenerated:{
        type:Boolean,
        default:false
    },

    usageCount:{
        type:Number,
        default:0
    },

    versions:{
        type:[versionSchema],
        default:[]
    },

    archived:{
        type:Boolean,
        default:false
    }

},{
    timestamps:true
});

questionBankSchema.index({
    schoolId:1,
    category:1
});

questionBankSchema.index({
    schoolId:1,
    difficulty:1
});

questionBankSchema.index({
    schoolId:1,
    tags:1
});

module.exports=
mongoose.model(
    "QuestionBank",
    questionBankSchema
);
