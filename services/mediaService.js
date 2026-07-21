const crypto = require("crypto");

function calculateChecksum(buffer){
    return crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");
}

function buildSearchRegex(search){

    return new RegExp(
        String(search || "")
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),
        "i"
    );

}

function normalizeTags(tags){

    if(Array.isArray(tags))
        return tags;

    return String(tags || "")
        .split(",")
        .map(t=>t.trim().toLowerCase())
        .filter(Boolean);

}

module.exports={
    calculateChecksum,
    buildSearchRegex,
    normalizeTags
};
