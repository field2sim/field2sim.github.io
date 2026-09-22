/* Portable projects and visual playback. Provider credentials and file handles never enter projects. */
(() => {
  'use strict';
  const core=Field2SimProject, $=id=>document.getElementById(id);
  const controlIds=[
    'nodeIdInput','intervalInput','originModeSelect','originLatInput','originLngInput','originAltInput',
    'circleRadiusSelect','circleRadiusCustomInput','autoNodeIds','experimental3d','simExportSelect',
    'enablePathLossProfile','propagationEnvironmentSelect','propagationProfileSelect',
    'propagationRangeInput','propagationInterferenceRangeInput','propagationSuccessRatioInput',
    'propagationRxSensitivityInput','propagationRssiInflectionInput','propagationPathLossExponentInput',
    'propagationShadowingInput','propagationTimeVariationSelect','propagationSeedInput',
    'newNodeGroupType','searchInput','playbackSpeed'
  ];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const status=message=>{$('projectStatus').textContent=message;};
  let projectName='scenario', replayTracks=[], markers=[], frame=null, clockTime=0, duration=0, previousFrame=null;
  const replayLayer=L.layerGroup().addTo(map);
  function pause(){if(frame!==null)cancelAnimationFrame(frame);frame=null;previousFrame=null;$('playRouteBtn').textContent='▶ Play';}
  function stop(){pause();clockTime=0;replayTracks=[];markers=[];replayLayer.clearLayers();$('playbackTime').value='0';$('playbackStatus').textContent='Press Play to preview mobile routes.';}
  function controls(){return Object.fromEntries(controlIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
  window.captureProjectExtras=()=>{
    const center=map.getCenter(), relevant=new Set(nodeGroups.flatMap(g=>g.points).map(p=>Field2SimElevation.key(p)));
    return {
      controls:controls(),mode,scanDirection:mobileScanDirection,
      map:{lat:center.lat,lng:((center.lng+540)%360)-180,zoom:map.getZoom(),basemap:activeBasemap},
      groupsCollapsed:$('nodeGroupsPanel').classList.contains('collapsed'),
      details:{compatibility:$('compatibilityDetails').open,propagation:$('propagationDetails').open},
      polygonDraft:polygonDraft.map(p=>({lat:p.lat,lng:p.lng})),
      elevations:[...elevationRecords.values()].filter(r=>relevant.has(r.key)),
      csc:selectedCoojaCsc?{name:selectedCoojaCsc.file.name,text:selectedCoojaCsc.text}:null,
      playback:{time:clockTime,expanded:$('playbackPanel').open},projectName
    };
  };
  function validateExtras(e){
    for(const id of controlIds){
      const value=e.controls[id], el=$(id);
      if(el.type==='checkbox'){if(typeof value!=='boolean')throw Error(`Missing checkbox: ${id}`);}
      else if(typeof value!=='string')throw Error(`Missing setting: ${id}`);
      else if(el.tagName==='SELECT'&&id!=='propagationProfileSelect'&&![...el.options].some(o=>o.value===value))throw Error(`Unknown setting: ${id}`);
    }
    const family=COOJA_CITED_PROFILES[e.controls.propagationEnvironmentSelect];
    if(!family?.profiles.some(p=>p.id===e.controls.propagationProfileSelect))throw Error('Unknown propagation profile.');
    if(typeof e.groupsCollapsed!=='boolean'||typeof e.projectName!=='string'||!e.playback||typeof e.playback.expanded!=='boolean'||!Number.isFinite(e.playback.time)||e.playback.time<0)throw Error('Invalid project display settings.');
    if(e.csc)inspectCoojaCsc(e.csc.text,e.csc.name);
  }
  window.restoreProjectExtras=e=>{
    stop();clearTimeout(latlngInputTimeout);clearTimeout(elevationAutoTimer);clearTimeout(sessionSaveTimeout);
    elevationController?.abort();
    // Set dependent selectors first; do not dispatch change handlers that reset user radio values.
    propagationEnvironmentSelect.value=e.controls.propagationEnvironmentSelect;
    populateCitedProfiles(e.controls.propagationProfileSelect);
    for(const id of controlIds){const el=$(id);if(el.type==='checkbox')el.checked=e.controls[id];else el.value=e.controls[id];}
    elevationRecords=new Map(e.elevations.map(r=>[r.key,clone(r)]));
    // Preserve stored heights on open, including old/manual values. New geometry can trigger lookup.
    try{const groups=elevationGroups('all');elevationAutoSignature=JSON.stringify(groups.map(g=>[g.id,g.points.map(p=>[p.nodeId,p.time,p.lat,p.lng]) ]));}catch(_){elevationAutoSignature=null;}
    selectedCoojaCsc=e.csc?{file:new File([e.csc.text],e.csc.name,{type:'application/xml'}),text:e.csc.text,inspection:inspectCoojaCsc(e.csc.text,e.csc.name),handle:null}:null;
    coojaCscFileInput.value='';
    coojaCscFileStatus.textContent=e.csc?`${e.csc.name} restored from project — downloads an updated copy; select the original file again to overwrite it.`:'No .csc file selected.';
    projectName=e.projectName;
    renderOriginUi();renderCircleRadiusUi();renderPropagationProfileUi();refreshSimulatorExportUi();
    updateWorkMode(e.mode);clearPolygonDraft();
    mobileScanDirection=e.scanDirection;
    scanDirHorizontalBtn.classList.toggle('active',mobileScanDirection==='horizontal');
    scanDirVerticalBtn.classList.toggle('active',mobileScanDirection==='vertical');
    polygonDraft=e.polygonDraft.map(p=>L.latLng(p.lat,p.lng));
    if(polygonDraft.length)polygonDraftLine=L.polyline(polygonDraft,{color:POLYGON_STROKE,weight:2,dashArray:'4 4'}).addTo(map);
    if(polygonDraft.length>=3)polygonPreview=L.polygon(polygonDraft,{color:POLYGON_STROKE,weight:2,fillOpacity:.08}).addTo(map);
    const active=nodeGroups.find(g=>g.id===activeNodeGroupId);
    latlngInput.value=active.draft ?? formatWaypointRows();
    if(!document.getElementById('experimental3d').checked){
      try {
        Field2SimNodeGroups.parseRows(latlngInput.value,active.type);
        latlngInput.value=latlngInput.value.split('\n').map(row=>row.trim()?row.trim().split(/\s+/).slice(0,4).join(' '):row).join('\n');
        active.draft=latlngInput.value;
      } catch (_) { /* Preserve invalid input for correction. */ }
    }
    $('nodeGroupsPanel').classList.toggle('collapsed',e.groupsCollapsed);$('nodeGroupsBody').hidden=e.groupsCollapsed;
    const toggle=$('toggleNodeGroupsBtn');toggle.textContent=e.groupsCollapsed?'▶':'◀';toggle.setAttribute('aria-expanded',String(!e.groupsCollapsed));toggle.setAttribute('aria-label',e.groupsCollapsed?'Show Node Groups':'Hide Node Groups');toggle.title=toggle.getAttribute('aria-label');
    map.invalidateSize({pan:false});map.setView([e.map.lat,e.map.lng],e.map.zoom,{animate:false});
    ++basemapRequest;keyForm.hidden=true;pendingProvider=null;keyInput.value='';
    if(providerLayers[e.map.basemap])showBasemap(e.map.basemap);
    else {
      const key=window.FIELD2SIM_MAP_CONFIG?.[e.map.basemap==='esri'?'esriApiKey':'maptilerApiKey'];
      if(key)loadBasemapProvider(e.map.basemap,key);
      else {showBasemap('street');basemapNote.textContent=`Saved background: ${e.map.basemap}. Select it and enter a key on this machine.`;}
    }
    $('compatibilityDetails').open=!!e.details?.compatibility;$('propagationDetails').open=!!e.details?.propagation;
    $('playbackPanel').open=e.playback.expanded;clockTime=e.playback.time;
    staticCoojaPositions=null;mobileCoojaTrace=null;clearOutputPreview();draw();
    // Restore never resumes motion or network elevation lookups implicitly.
    clearTimeout(elevationAutoTimer);persistSessionStateNow();
  };
  function buildProject(){
    clearTimeout(latlngInputTimeout);
    const state=snapshot();
    return core.validate({format:core.FORMAT,version:core.VERSION,state});
  }
  function applyProject(project){
    core.validate(project);validateExtras(project.state.projectExtras);
    const state=clone(project.state);
    if(state.experimental3d!==state.projectExtras.controls.experimental3d)throw Error('Conflicting 2D/3D settings.');
    commitHistory();restore(state);status('Project opened. All groups and settings restored.');
  }
  // Exposed for reproducibility checks and future project migrations.
  window.Field2SimWorkspace={buildProject,applyProject};
  $('saveProjectBtn').addEventListener('click',()=>{
    try{
      const data=core.encode(buildProject().state);
      if(data.length>25*1024*1024)throw Error('Project exceeds the 25 MB file limit.');
      const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=projectName.replace(/[^a-zA-Z0-9_-]/g,'-')+'.field2sim';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status('Project saved (.field2sim). API keys and local file permissions are excluded.');
    }catch(e){status(`Save failed: ${e.message}`);}
  });
  $('openProjectBtn').addEventListener('click',()=>$('projectFileInput').click());
  $('projectFileInput').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>25*1024*1024)throw Error('Project exceeds the 25 MB import limit.');const project=core.decode(await file.text());applyProject(project);}
    catch(e){status(`Open failed: ${e.message}`);}finally{event.target.value='';}
  });
  $('projectExample').addEventListener('change',async event=>{
    if(event.target.value!=='central-park')return;
    try{const response=await fetch('examples/projects/central-park.field2sim');if(!response.ok)throw Error('Example could not be loaded.');applyProject(core.decode(await response.text()));status('Illustrative Central Park example: static sensors + mobile collector. Undo restores your previous project.');}
    catch(e){status(e.message);}finally{event.target.value='';}
  });
  function preparePlayback(){
    syncActiveNodeGroup();
    const groups=Field2SimNodeGroups.collect(nodeGroups);
    replayTracks=core.tracks(groups);
    if(!replayTracks.length)throw Error('Add a mobile group with timestamped waypoints first.');
    duration=Math.max(...replayTracks.map(t=>t.points[t.points.length-1].time));
    $('playbackTime').max=String(duration||1);clockTime=Math.min(clockTime,duration);
    replayLayer.clearLayers();markers=replayTracks.map((track,i)=>{
      const colors=['#dc2626','#0891b2','#7c3aed','#d97706'];
      const marker=L.circleMarker([0,0],{radius:9,color:'#fff',weight:2,fillColor:colors[i%colors.length],fillOpacity:1,interactive:false,pane:'tooltipPane'});
      const label=document.createElement('span');label.textContent=`${track.name} · node ${track.points[0].nodeId}`;marker.bindTooltip(label,{permanent:true,direction:'top'});return marker;
    });
  }
  function renderPlayback(){
    replayTracks.forEach((track,i)=>{const p=core.atTime(track.points,clockTime),marker=markers[i];if(p){marker.setLatLng([p.lat,p.lng]);if(!replayLayer.hasLayer(marker))replayLayer.addLayer(marker);}else replayLayer.removeLayer(marker);});
    $('playbackTime').value=String(clockTime);
    $('playbackStatus').textContent=`${clockTime.toFixed(1)} / ${duration.toFixed(1)} s · ${replayTracks.length} mobile group(s) · linear waypoint preview`;
  }
  function tick(now){
    if(previousFrame!==null)clockTime=Math.min(duration,clockTime+(now-previousFrame)/1000*Number($('playbackSpeed').value));previousFrame=now;
    renderPlayback();if(clockTime>=duration){pause();return;}frame=requestAnimationFrame(tick);
  }
  $('playRouteBtn').addEventListener('click',()=>{
    if(frame!==null){pause();return;}
    try{preparePlayback();if(clockTime>=duration)clockTime=0;renderPlayback();$('playRouteBtn').textContent='Ⅱ Pause';frame=requestAnimationFrame(tick);}
    catch(e){stop();$('playbackStatus').textContent=e.message;}
  });
  $('stopRouteBtn').addEventListener('click',stop);
  $('playbackTime').addEventListener('input',()=>{pause();const t=Number($('playbackTime').value);try{preparePlayback();clockTime=Math.min(t,duration);renderPlayback();}catch(e){$('playbackStatus').textContent=e.message;}});
  // Editing stops a stale preview; background navigation does not change scenario time.
  $('sidebar').addEventListener('input',event=>{if(!event.target.closest('#playbackPanel'))stop();});
  $('nodeGroupsPanel').addEventListener('click',stop);
  ['undoBtn','redoBtn','resetBtn','deleteBtn'].forEach(id=>$(id).addEventListener('click',stop));
  map.on('mousedown',()=>{if(mode!=='maps')stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  $('sidebar').addEventListener('change',persistSessionStateDebounced);
  // Legacy sessions remain readable; new sessions retain all project settings.
  if(restoredSession?.projectExtras){try{validateExtras(restoredSession.projectExtras);restoreProjectExtras(restoredSession.projectExtras);}catch(e){status(`Some saved settings could not be restored: ${e.message}`);}}
  // Compact controls keep the authoring panel stable until explicitly opened.
  document.addEventListener('click',event=>{if(!$('projectMenu').contains(event.target))$('projectMenu').open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && $('projectMenu').open){$('projectMenu').open=false;$('projectMenu').querySelector('summary').focus();}},true);
})();
