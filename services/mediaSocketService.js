function emit(io,event,payload,schoolId,classId){

    if(!io) return;

    if(classId){

        io.to(`media:class:${classId}`)
        .emit(event,payload);

    }

    if(schoolId){

        io.to(`media:school:${schoolId}`)
        .emit(event,payload);

        io.to(String(schoolId))
        .emit(event,payload);

    }

}

module.exports={emit};
