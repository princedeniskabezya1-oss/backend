const mongoose = require("mongoose");

const { Schema } = mongoose;

const chatAssetSchema = new Schema(
  {
    owner:{
      type:Schema.Types.ObjectId,
      ref:"User",
      required:true,
      index:true
    },

    type:{
      type:String,
      enum:["sticker","gif"],
      default:"sticker",
      index:true
    },

    title:{
      type:String,
      trim:true,
      default:""
    },

    url:{
      type:String,
      required:true,
      trim:true
    },

    publicId:{
      type:String,
      trim:true
    },

    mimeType:{
      type:String,
      trim:true
    },

    source:{
      type:String,
      enum:["uploaded","saved_from_chat","imported"],
      default:"uploaded"
    },

    originalMessageId:{
      type:Schema.Types.ObjectId,
      ref:"Message"
    },

    isFavorite:{
      type:Boolean,
      default:false
    }
  },
  {
    timestamps:true
  }
);

chatAssetSchema.index({ owner:1, type:1, createdAt:-1 });

module.exports = mongoose.model("ChatAsset", chatAssetSchema);
