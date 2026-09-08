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
  // Renumber only after a single existing row's ID changes; preserve all other fields.
  function renumberFollowingIds(before, after) {
    const oldRows=before.split('\n'), rows=after.split('\n');
    if(oldRows.length!==rows.length)return after;
    const changed=rows.map((r,i)=>r!==oldRows[i]?i:-1).filter(i=>i>=0);
    if(changed.length!==1)return after;
    const index=changed[0], oldMatch=oldRows[index].match(/^(\s*)(\d+)(\s+.*)$/), match=rows[index].match(/^(\s*)(\d+)(\s+.*)$/);
    if(!oldMatch||!match||oldMatch[2]===match[2]||oldMatch[3]!==match[3])return after;
    let id=Number(match[2]);
    if(!Number.isSafeInteger(id)||id<1)return after;
    for(let i=index+1;i<rows.length;i++){
      if(!rows[i].trim())continue;
      if(!/^\s*\d+\s+/.test(rows[i])||!Number.isSafeInteger(++id))return after;
      rows[i]=rows[i].replace(/^(\s*)\d+/,(_,space)=>space+id);
    }
    return rows.join('\n');
  }
  return {parseRows,collect,renumberFollowingIds};
});
