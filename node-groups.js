(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.Field2SimNodeGroups=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function parseRows(text,type){
    if(!text.trim())return [];
    const points=text.trim().split(/\r?\n/).map((line,i)=>{
      const f=line.trim().split(/\s+/).map(Number);
      if((f.length!==4&&f.length!==5)||!f.every(Number.isFinite)||!Number.isSafeInteger(f[0])||f[0]<1||f[1]<0||Math.abs(f[2])>90||Math.abs(f[3])>180)throw Error(`Invalid row ${i+1}. Expected node_id time latitude longitude [altitude].`);
      return {nodeId:f[0],time:type==='fixed'?0:f[1],lat:f[2],lng:f[3],z:f[4]||0,timeGenerated:false};
    });
    const ids=new Set(points.map(p=>p.nodeId));
    if(type==='fixed'&&ids.size!==points.length)throw Error('Static nodes need unique IDs.');
    if(type==='mobile'&&ids.size!==1)throw Error('Each Mobile group must contain one node ID.');
    return points;
  }
  function collect(groups){
    const owners=new Map();
    return groups.map(g=>{
      let points;try{points=typeof g.draft==='string'?parseRows(g.draft,g.type):g.points;}catch(e){throw Error(`${g.name}: ${e.message}`)}
      for(const id of new Set(points.map(p=>p.nodeId))){if(owners.has(id))throw Error(`Node ID ${id} is used in both ${owners.get(id)} and ${g.name}. IDs must be unique across groups.`);owners.set(id,g.name)}
      return {...g,points};
    });
  }
  return {parseRows,collect};
});
