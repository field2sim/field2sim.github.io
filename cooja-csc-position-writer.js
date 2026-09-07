(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Field2SimCscPositionWriter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function validatePoints(points) {
    if (!Array.isArray(points) || !points.length) throw new Error('Place at least one static node.');
    const ids = new Set();
    for (const p of points) {
      if (!Number.isSafeInteger(p.nodeId) || p.nodeId < 1 || ![p.x, p.y, p.z].every(Number.isFinite)) throw new Error('Static nodes require positive integer IDs and finite coordinates.');
      if (ids.has(p.nodeId)) throw new Error(`Duplicate Field2Sim node ID: ${p.nodeId}.`);
      ids.add(p.nodeId);
    }
  }
  function createStaticArtifact(points) {
    validatePoints(points);
    const positions = points.map(p => ({nodeId:p.nodeId, x:p.x, y:p.y === 0 ? 0 : -p.y, z:p.z}));
    return {adapterId:'cooja', filename:'static-positions.csc', mimeType:'application/xml', positions,
      text:['# Cooja mote ID   x (m)   y (m)   z (m)', ...positions.map(p => `${p.nodeId} ${p.x.toFixed(9)} ${p.y.toFixed(9)} ${p.z.toFixed(9)}`)].join('\n'),
      warnings:['Static positions are matched by Cooja mote ID. Save export selects an existing .csc simulation to update.']};
  }
  function patchPositions(text, points) {
    validatePoints(points);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || doc.doctype) throw new Error('Select a well-formed CSC XML file without a document type declaration.');
    const simulations = doc.getElementsByTagName('simulation');
    if (doc.documentElement.tagName !== 'simconf' || simulations.length !== 1) throw new Error('Expected one Cooja simulation in a simconf document.');
    const simulation = simulations[0];
    const direct = (el, tag) => Array.from(el.children).filter(c => c.tagName === tag);
    const className = el => Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    // Only real motes within the simulation; plugin mote references are excluded.
    const motes = direct(simulation, 'mote').concat(direct(simulation, 'motetype').flatMap(mt => direct(mt, 'mote')));
    const byId = new Map();
    for (const mote of motes) {
      const configs = direct(mote, 'interface_config');
      const idConfigs = configs.filter(c => /(?:^|\.)\w*MoteID$/.test(className(c)));
      const ids = idConfigs.flatMap(c => direct(c, 'id'));
      if (!ids.length) continue;
      if (ids.length !== 1 || !/^\d+$/.test(ids[0].textContent.trim())) throw new Error('Ambiguous or invalid mote ID in CSC.');
      const id = Number(ids[0].textContent.trim());
      if (byId.has(id)) throw new Error(`Duplicate Cooja mote ID: ${id}.`);
      byId.set(id, configs);
    }
    const matched = [], missing = [];
    for (const point of points) {
      const configs = byId.get(point.nodeId);
      if (!configs) {missing.push(point.nodeId); continue;}
      const positions = configs.filter(c => /(?:^|\.)Position$/.test(className(c)));
      if (positions.length !== 1) throw new Error(`Mote ${point.nodeId} needs exactly one Position interface.`);
      const position = positions[0], pos = direct(position, 'pos');
      if (pos.length > 1) throw new Error(`Ambiguous Position for mote ${point.nodeId}.`);
      if (pos.length) {
        for (const axis of ['x','y','z']) pos[0].setAttribute(axis, String(point[axis]));
      } else {
        // Older Cooja versions store separate x/y/z children.
        for (const axis of ['x','y','z']) {
          const nodes = direct(position, axis);
          if (nodes.length > 1) throw new Error(`Ambiguous ${axis} coordinate for mote ${point.nodeId}.`);
          const node = nodes[0] || position.appendChild(doc.createElement(axis));
          node.textContent = String(point[axis]);
        }
      }
      matched.push(point.nodeId);
    }
    if (!matched.length) throw new Error('No Field2Sim node IDs match the selected CSC. No file was written.');
    const hasMobility = Array.from(doc.getElementsByTagName('plugin')).some(c => /(?:^|\.)Mobility$/.test(className(c)));
    return {text:new XMLSerializer().serializeToString(doc),matched,missing,hasMobility};
  }
  function patchMobility(text, trace) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || doc.doctype || doc.documentElement.tagName !== 'simconf') throw new Error('Select a well-formed Cooja CSC file.');
    const simulations = doc.getElementsByTagName('simulation');
    if (simulations.length !== 1) throw new Error('Expected exactly one simulation.');
    const direct = (el, tag) => Array.from(el.children).filter(c => c.tagName === tag);
    const className = el => Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    const simulation = simulations[0];
    // Preserve document order: Mobility addresses the simulation's mote-array indices.
    const motes = Array.from(simulation.getElementsByTagName('mote')).filter(m => m.parentElement === simulation || (m.parentElement.tagName === 'motetype' && m.parentElement.parentElement === simulation));
    const indices = new Map();
    motes.forEach((mote, index) => {
      const ids = direct(mote, 'interface_config').filter(c => /(?:^|\.)\w*MoteID$/.test(className(c))).flatMap(c => direct(c, 'id'));
      if (ids.length !== 1 || !/^\d+$/.test(ids[0].textContent.trim())) throw new Error('Every CSC mote needs one unambiguous mote ID for mobile export.');
      const id = Number(ids[0].textContent.trim());
      if (indices.has(id)) throw new Error(`Duplicate Cooja mote ID: ${id}.`);
      indices.set(id,index);
    });
    const mappings = new Map();
    let lastTime = -1;
    const lastTimes = new Map();
    const rows = trace.trim().split(/\r?\n/).map(row => {
      const fields = row.trim().split(/\s+/).map(Number);
      if (fields.length !== 5 || !fields.every(Number.isFinite) || !Number.isSafeInteger(fields[0]) || fields[0] < 0 || fields[1] < 0 || fields[1] < lastTime || fields[4] !== 0) throw new Error('Expected a planar mobile trace with increasing timestamps.');
      lastTime = fields[1];
      const id = fields[0] + 1;
      if (lastTimes.has(id) && fields[1] <= lastTimes.get(id)) throw new Error(`Node ${id} timestamps must increase.`);
      lastTimes.set(id, fields[1]);
      if (!indices.has(id)) throw new Error(`Mobile node ID ${id} does not exist in the selected CSC. No files were written.`);
      mappings.set(id,indices.get(id));
      fields[0] = indices.get(id);
      return fields.join(' ');
    });
    if (lastTime <= 0 || Array.from(lastTimes.values()).some(t => t <= 0)) throw new Error('Every mobile route needs a positive duration.');
    const plugins = direct(doc.documentElement, 'plugin').filter(p => /(?:^|\.)Mobility$/.test(className(p)));
    if (plugins.length > 1) throw new Error('Multiple Mobility plugins in CSC; cannot choose one unambiguously.');
    const plugin = plugins[0] || doc.documentElement.appendChild(doc.createElement('plugin'));
    if (!plugins.length) plugin.appendChild(doc.createTextNode('org.contikios.cooja.plugins.Mobility'));
    const configs = direct(plugin,'plugin_config');
    if (configs.length > 1) throw new Error('Multiple Mobility configurations in CSC.');
    const config = configs[0] || plugin.appendChild(doc.createElement('plugin_config'));
    const paths = direct(config,'positions');
    if (paths.length > 1) throw new Error('Multiple Mobility positions paths in CSC.');
    const path = paths[0] || config.appendChild(doc.createElement('positions'));
    path.textContent = '[CONFIG_DIR]/positions.dat';
    return {text:new XMLSerializer().serializeToString(doc),trace:rows.join('\n')+'\n',mappings:Array.from(mappings,([nodeId,index])=>({nodeId,index}))};
  }
  return {createStaticArtifact,patchPositions,patchMobility};
});
