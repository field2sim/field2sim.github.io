(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.Field2SimProject=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='field2sim-project', VERSION=1;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function coordinate(p){return p&&finite(p.lat)&&Math.abs(p.lat)<=90&&finite(p.lng)&&Math.abs(p.lng)<=180;}
  function validate(project){
    const fail=message=>{throw Error(message);};
    if(!project||project.format!==FORMAT)fail('This is not a Field2Sim project.');
    if(project.version!==VERSION)fail('Unsupported project version.');
    const s=project.state,e=s?.projectExtras;
    if(!s||!Array.isArray(s.nodeGroups)||!s.nodeGroups.length||!e)fail('Project state is incomplete.');
    const ids=new Set();
    for(const g of s.nodeGroups){
      if(!g||typeof g.id!=='string'||ids.has(g.id)||typeof g.name!=='string'||!['mobile','fixed'].includes(g.type)||!Array.isArray(g.points))fail('Invalid node group.');
      ids.add(g.id);
      for(const p of g.points)if(!coordinate(p)||!Number.isSafeInteger(p.nodeId)||p.nodeId<1||!finite(p.time)||p.time<0||!finite(p.z))fail('Invalid waypoint.');
      if(g.draft!==undefined&&typeof g.draft!=='string')fail('Invalid group input.');
      if(g.polygons!==undefined){if(!Array.isArray(g.polygons))fail('Invalid polygons.');for(const polygon of g.polygons){if(!Array.isArray(polygon))fail('Invalid polygon.');for(const ring of polygon)if(!Array.isArray(ring)||!ring.every(coordinate))fail('Invalid polygon coordinates.');}}
    }
    if(!ids.has(s.activeNodeGroupId))fail('Active node group is missing.');
    if(typeof s.experimental3d!=='boolean')fail('Missing 2D/3D setting.');
    if(!s.origin||!['first','custom'].includes(s.origin.mode)||(s.origin.mode==='custom'&&(!coordinate(s.origin)||!finite(s.origin.alt))))fail('Invalid coordinate origin.');
    if(!e.controls||typeof e.controls!=='object'||!['maps','point','polygon'].includes(e.mode)||!['horizontal','vertical'].includes(e.scanDirection))fail('Invalid editor configuration.');
    if(!e.map||!coordinate(e.map)||!finite(e.map.zoom)||e.map.zoom<0||e.map.zoom>19||!['street','eox','esri','maptiler'].includes(e.map.basemap))fail('Invalid map configuration.');
    if(!Array.isArray(e.polygonDraft)||!e.polygonDraft.every(coordinate))fail('Invalid polygon draft.');
    if(!Array.isArray(e.elevations)||e.elevations.some(r=>!r||typeof r.key!=='string'||!r.result||typeof r.result!=='object'))fail('Invalid elevation provenance.');
    if(e.csc!==null&&(!e.csc||typeof e.csc.name!=='string'||typeof e.csc.text!=='string'))fail('Invalid Cooja configuration.');
    return project;
  }
  function encode(state){return JSON.stringify(validate({format:FORMAT,version:VERSION,state}),null,2)+'\n';}
  function decode(text){if(text.length>25*1024*1024)throw Error('Project exceeds the 25 MB import limit.');return validate(JSON.parse(text));}
  function tracks(groups){
    return groups.filter(g=>g.type==='mobile'&&g.points.length).map(g=>{
      const points=g.points.map(p=>({...p}));
      for(let i=0;i<points.length;i++)if(!coordinate(points[i])||!finite(points[i].time)||points[i].time<0||(i&&points[i].time<=points[i-1].time))throw Error(`${g.name}: playback needs strictly increasing waypoint times.`);
      return {id:g.id,name:g.name,points};
    });
  }
  // Linear geographic interpolation is a visual preview; simulator motion semantics may differ.
  function atTime(points,t){
    if(t<points[0].time)return null;
    if(t>=points[points.length-1].time)return {...points[points.length-1]};
    let lo=0,hi=points.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].time<=t)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],f=(t-a.time)/(b.time-a.time);
    const delta=((b.lng-a.lng+540)%360)-180;
    return {lat:a.lat+(b.lat-a.lat)*f,lng:((a.lng+delta*f+540)%360)-180,z:(a.z||0)+((b.z||0)-(a.z||0))*f};
  }
  function segmentIndex(points,t){let i=0;while(i+1<points.length&&points[i+1].time<=t)i++;return i;}
  function distance(a,b,use3d=false){
    const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
    const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
    const horizontal=2*6371000*Math.asin(Math.sqrt(Math.min(1,h)));
    return Math.hypot(horizontal,use3d?(b.z||0)-(a.z||0):0);
  }
  function averageSpeed(points,use3d=false){
    if(points.length<2)return null;
    tracks([{type:'mobile',name:'Route',points}]);
    let length=0;
    for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i],use3d);
    return length/(points[points.length-1].time-points[0].time);
  }
  return {FORMAT,VERSION,encode,decode,validate,tracks,atTime,segmentIndex,distance,averageSpeed};
});
