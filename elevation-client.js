(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.Field2SimElevation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const endpoint='https://iotlab.omu.edu.tr/elevation/v1/elevation';
  const key=p=>JSON.stringify([p.lat,p.lng]);
  async function lookup(points,{signal,onProgress=()=>{},fetchImpl=fetch}={}){
    const unique=[...new Map(points.map(p=>{
      if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw Error('Invalid geographic coordinate.');
      return [key(p),{lat:p.lat,lng:p.lng}];
    })).values()];
    const records=[];
    for(let start=0;start<unique.length;start+=100){
      signal?.throwIfAborted();
      const batch=unique.slice(start,start+100);
      const response=await fetchImpl(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({locations:batch.map(p=>({latitude:p.lat,longitude:p.lng}))}),signal});
      const body=await response.json().catch(()=>null);
      if(!response.ok){
        const retry=Number(response.headers.get('Retry-After'));
        const unavailable=body?.error?.code==='upstream_unavailable'||[502,503,504].includes(response.status);
        const detail=unavailable?' The elevation service could not obtain data from its provider. Coordinates are unchanged. Try switching 3D off and on again later.':'';
        throw Error(`Elevation service: HTTP ${response.status}.${detail}${retry>0?` Try again after ${retry} seconds.`:''}`);
      }
      if(!Array.isArray(body?.results)||body.results.length!==batch.length||body.metadata?.dataset!=='mapzen'||body.metadata?.units!=='metres')throw Error('Invalid elevation response.');
      body.results.forEach((r,i)=>{
        if(r.latitude!==batch[i].lat||r.longitude!==batch[i].lng||!((r.status==='ok'&&Number.isFinite(r.elevation_m))||(r.status==='no_data'&&r.elevation_m===null))||!Number.isFinite(Date.parse(r.fetched_at)))throw Error('Invalid elevation result.');
        records.push({key:key(batch[i]),result:r,metadata:body.metadata});
      });
      onProgress(Math.min(start+100,unique.length),unique.length);
    }
    return records;
  }
  return {lookup,key};
});
