(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Field2SimSimulatorAdapters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NUMBER_PATTERN = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
  const EPSILON = 1e-9;

  class AdapterValidationError extends Error {
    constructor(adapterId, errors) {
      super(`${adapterId} adapter validation failed: ${errors.join(' ')}`);
      this.name = 'AdapterValidationError';
      this.adapterId = adapterId;
      this.errors = errors.slice();
    }
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function formatNumber(value) {
    return value.toFixed(9);
  }

  function validateCanonicalScenario(input) {
    const errors = [];
    if (!input || typeof input !== 'object') return ['A canonical local scenario object is required.'];
    if (input.scenario !== 'mobile' && input.scenario !== 'fixed') {
      errors.push('Scenario must be "mobile" or "fixed".');
    }
    if (!Array.isArray(input.waypoints) || input.waypoints.length === 0) {
      errors.push('At least one local waypoint is required.');
      return errors;
    }

    input.waypoints.forEach((point, index) => {
      const row = index + 1;
      if (!Number.isInteger(point.nodeId) || point.nodeId < 1) {
        errors.push(`Waypoint ${row} has an invalid one-based nodeId.`);
      }
      for (const field of ['time', 'x', 'y', 'z']) {
        if (!isFiniteNumber(point[field])) errors.push(`Waypoint ${row} has a non-finite ${field} value.`);
      }
      if (isFiniteNumber(point.time) && point.time < 0) {
        errors.push(`Waypoint ${row} has a negative timestamp.`);
      }
    });

    if (errors.length) return errors;
    if (input.scenario === 'mobile') {
      const nodeId = input.waypoints[0].nodeId;
      if (input.waypoints.some(point => point.nodeId !== nodeId)) {
        errors.push('A mobile scenario must contain waypoints for exactly one nodeId.');
      }
      for (let i = 1; i < input.waypoints.length; i++) {
        if (input.waypoints[i].time <= input.waypoints[i - 1].time) {
          errors.push(`Mobile timestamps must be strictly increasing (waypoints ${i} and ${i + 1}).`);
        }
      }
    } else {
      const ids = new Set();
      input.waypoints.forEach(point => {
        if (ids.has(point.nodeId)) errors.push(`Static nodeId ${point.nodeId} occurs more than once.`);
        ids.add(point.nodeId);
      });
    }
    return errors;
  }

  function assertScenario(adapterId, scenario, extraValidation) {
    const errors = validateCanonicalScenario(scenario);
    if (extraValidation) errors.push(...extraValidation(scenario));
    if (errors.length) throw new AdapterValidationError(adapterId, errors);
  }

  function groupByNode(scenario) {
    const groups = new Map();
    scenario.waypoints.forEach((point, sourceIndex) => {
      if (!groups.has(point.nodeId)) groups.set(point.nodeId, []);
      groups.get(point.nodeId).push({ ...point, sourceIndex });
    });
    for (const points of groups.values()) {
      points.sort((a, b) => a.time - b.time || a.sourceIndex - b.sourceIndex);
    }
    return groups;
  }

  function simulatorPoint(point) {
    return { x: point.x, y: point.y === 0 ? 0 : -point.y, z: point.z };
  }

  function validateCoojaOutput(text, expectedScenario) {
    const errors = [];
    const rows = String(text).split(/\r?\n/).filter(line => line.trim());
    const parsed = [];
    rows.forEach((line, index) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 5) {
        errors.push(`Cooja row ${index + 1} must contain exactly five fields.`);
        return;
      }
      const nodeIndex = Number(parts[0]);
      const time = Number(parts[1]);
      const x = Number(parts[2]);
      const y = Number(parts[3]);
      const z = Number(parts[4]);
      if (!Number.isInteger(nodeIndex) || nodeIndex < 0) errors.push(`Cooja row ${index + 1} has an invalid zero-based node index.`);
      if (![time, x, y, z].every(Number.isFinite)) errors.push(`Cooja row ${index + 1} contains a non-numeric field.`);
      parsed.push({ nodeIndex, time, x, y, z });
    });
    if (expectedScenario && rows.length !== expectedScenario.waypoints.length) {
      errors.push(`Expected ${expectedScenario.waypoints.length} Cooja rows, found ${rows.length}.`);
    }
    return { valid: errors.length === 0, errors, rows: parsed };
  }

  function parseCooja(text, options = {}) {
    const scenarioType = options.scenario === 'fixed' ? 'fixed' : 'mobile';
    const errors = [];
    const waypoints = [];
    String(text).split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 4 && parts.length !== 5) {
        errors.push(`Cooja import row ${index + 1} must contain four or five fields.`);
        return;
      }
      const simulatorNodeId = Number(parts[0]);
      const time = Number(parts[1]);
      const x = Number(parts[2]);
      const coojaY = Number(parts[3]);
      const z = parts.length === 5 ? Number(parts[4]) : 0;
      if (!Number.isInteger(simulatorNodeId) || simulatorNodeId < 0 || ![time, x, coojaY, z].every(Number.isFinite)) {
        errors.push(`Cooja import row ${index + 1} contains an invalid value.`);
        return;
      }
      waypoints.push({
        nodeId: simulatorNodeId + 1,
        time: scenarioType === 'fixed' ? 0 : time,
        x,
        y: coojaY === 0 ? 0 : -coojaY,
        z
      });
    });
    if (!waypoints.length) errors.push('The Cooja file contains no valid rows.');
    if (scenarioType === 'mobile' && waypoints.length) {
      const nodeId = waypoints[0].nodeId;
      if (waypoints.some(point => point.nodeId !== nodeId)) errors.push('A mobile Cooja file must use one node index.');
      for (let i = 1; i < waypoints.length; i++) {
        if (waypoints[i].time <= waypoints[i - 1].time) errors.push('Mobile Cooja timestamps must be strictly increasing.');
      }
    }
    if (errors.length) throw new AdapterValidationError('cooja', errors);
    return { scenario: scenarioType, waypoints };
  }

  function coojaExtraValidation(scenario) {
    const errors = [];
    if (!scenario || typeof scenario !== 'object' || !Array.isArray(scenario.waypoints)) return errors;
    if (scenario.scenario === 'fixed') {
      errors.push(
        'Static Cooja export is disabled: the tested Mobility plugin wraps all-zero timestamps into a zero-duration cycle.'
      );
    }
    return errors;
  }

  function coojaCompatibilityWarnings(scenario) {
    if (!scenario || scenario.scenario !== 'mobile') return [];
    return [
      'Cyclic mobility: the tested Cooja Mobility plugin restarts at the first waypoint after the final timestamp.',
      'Node mapping: exported node numbers are zero-based mote-array indices, not Cooja mote IDs.',
      ...(scenario.waypoints.some(p => Math.abs(p.z) > EPSILON) ? ['Z is included in positions.dat, but the tested Cooja Mobility plugin ignores it and retains the mote’s existing Z.'] : [])
    ];
  }

  const coojaAdapter = Object.freeze({
    id: 'cooja',
    label: 'Cooja',
    filename: 'positions.dat',
    mimeType: 'text/plain',
    outputHint: 'Cooja Mobility (cyclic: mote-index time x y z)',
    validate(scenario) {
      return validateCanonicalScenario(scenario).concat(coojaExtraValidation(scenario));
    },
    warnings: coojaCompatibilityWarnings,
    serialize(scenario) {
      assertScenario('cooja', scenario, coojaExtraValidation);
      const text = scenario.waypoints.map(point => {
        const simulatorNodeId = point.nodeId - 1;
        const time = scenario.scenario === 'fixed' ? 0 : point.time;
        const mapped = simulatorPoint(point);
        return `${simulatorNodeId} ${formatNumber(time)} ${formatNumber(mapped.x)} ${formatNumber(mapped.y)} ${formatNumber(mapped.z)}`;
      }).join('\n');
      const report = validateCoojaOutput(text, scenario);
      if (!report.valid) throw new AdapterValidationError('cooja', report.errors);
      return text;
    },
    parse: parseCooja,
    validateOutput: validateCoojaOutput
  });

  function validateNs2FamilyOutput(text) {
    const errors = [];
    const initialized = new Map();
    const movements = [];
    const altitudeUpdates = [];
    const initialPattern = new RegExp(`^\\$node_\\((\\d+)\\)\\s+set\\s+([XYZ])_\\s+(${NUMBER_PATTERN})$`);
    const movePattern = new RegExp(`^\\$ns_\\s+at\\s+(${NUMBER_PATTERN})\\s+"\\$node_\\((\\d+)\\)\\s+setdest\\s+(${NUMBER_PATTERN})\\s+(${NUMBER_PATTERN})\\s+(${NUMBER_PATTERN})"$`);
    const altitudePattern = new RegExp(`^\\$ns_\\s+at\\s+(${NUMBER_PATTERN})\\s+"\\$node_\\((\\d+)\\)\\s+set Z_\\s+(${NUMBER_PATTERN})"$`);

    String(text).split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;
      const initial = line.match(initialPattern);
      if (initial) {
        const nodeIndex = Number(initial[1]);
        const axis = initial[2];
        const value = Number(initial[3]);
        if (!initialized.has(nodeIndex)) initialized.set(nodeIndex, new Map());
        if (initialized.get(nodeIndex).has(axis)) errors.push(`Duplicate ${axis}_ initialization for node ${nodeIndex}.`);
        initialized.get(nodeIndex).set(axis, value);
        return;
      }
      const altitude = line.match(altitudePattern);
      if (altitude) {
        const update = {time:Number(altitude[1]), nodeIndex:Number(altitude[2]), z:Number(altitude[3])};
        if(update.time < 0) errors.push(`Invalid altitude update time at line ${index+1}.`);
        altitudeUpdates.push(update);
        return;
      }
      const move = line.match(movePattern);
      if (move) {
        const movement = {
          time: Number(move[1]),
          nodeIndex: Number(move[2]),
          x: Number(move[3]),
          y: Number(move[4]),
          speed: Number(move[5]),
          line: index + 1
        };
        if (movement.time < 0 || movement.speed < 0) errors.push(`Invalid time or speed at trace line ${movement.line}.`);
        movements.push(movement);
        return;
      }
      errors.push(`Unrecognized ns-2 mobility statement at line ${index + 1}.`);
    });

    for (const [nodeIndex, axes] of initialized) {
      for (const axis of ['X', 'Y', 'Z']) {
        if (!axes.has(axis)) errors.push(`Node ${nodeIndex} is missing ${axis}_ initialization.`);
      }
    }
    [...movements, ...altitudeUpdates].forEach(move => {
      if (!initialized.has(move.nodeIndex)) errors.push(`Movement references uninitialized node ${move.nodeIndex}.`);
    });
    if (!initialized.size) errors.push('The trace contains no node initialization statements.');
    return { valid: errors.length === 0, errors, initialized, movements, altitudeUpdates };
  }

  function ns2FamilyExtraValidation(scenario) {
    return [];
  }

  function createNs2FamilyAdapter(id, label, filename, hint) {
    return Object.freeze({
      id,
      label,
      filename,
      mimeType: 'text/plain',
      outputHint: hint,
      warnings(scenario) {
        return scenario.scenario === 'mobile' && scenario.waypoints.some(p=>p.z!==scenario.waypoints[0].z)
          ? ['Z changes at waypoint timestamps; setdest interpolates X/Y only, not continuous vertical motion.'] : [];
      },
      validate(scenario) {
        return validateCanonicalScenario(scenario).concat(ns2FamilyExtraValidation(scenario));
      },
      serialize(scenario) {
        assertScenario(id, scenario, ns2FamilyExtraValidation);
        const groups = groupByNode(scenario);
        const lines = [
          `# ${label} mobility trace generated from a WGS84-derived local ENU scenario.`,
          '# Axis convention: X=east, Y=-north, Z=local height; editor nodeId maps to node_(nodeId-1).'
        ];
        const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);
        sortedIds.forEach(nodeId => {
          const nodeIndex = nodeId - 1;
          const first = simulatorPoint(groups.get(nodeId)[0]);
          lines.push(`$node_(${nodeIndex}) set X_ ${formatNumber(first.x)}`);
          lines.push(`$node_(${nodeIndex}) set Y_ ${formatNumber(first.y)}`);
          lines.push(`$node_(${nodeIndex}) set Z_ ${formatNumber(first.z)}`);
        });
        if (scenario.scenario === 'mobile') {
          sortedIds.forEach(nodeId => {
            const nodeIndex = nodeId - 1;
            const path = groups.get(nodeId);
            for (let i = 0; i < path.length - 1; i++) {
              if(i > 0 && path[i].z !== path[i-1].z)
                lines.push(`$ns_ at ${formatNumber(path[i].time)} "$node_(${nodeIndex}) set Z_ ${formatNumber(path[i].z)}"`);
              const from = simulatorPoint(path[i]);
              const to = simulatorPoint(path[i + 1]);
              const dt = path[i + 1].time - path[i].time;
              const speed = Math.hypot(to.x - from.x, to.y - from.y) / dt;
              lines.push(`$ns_ at ${formatNumber(path[i].time)} "$node_(${nodeIndex}) setdest ${formatNumber(to.x)} ${formatNumber(to.y)} ${formatNumber(speed)}"`);
            }
            const last = path.length - 1;
            if(last > 0 && path[last].z !== path[last-1].z)
              lines.push(`$ns_ at ${formatNumber(path[last].time)} "$node_(${nodeIndex}) set Z_ ${formatNumber(path[last].z)}"`);
          });
        }
        const text = lines.join('\n');
        const report = validateNs2FamilyOutput(text);
        if (!report.valid) throw new AdapterValidationError(id, report.errors);
        return text;
      },
      validateOutput: validateNs2FamilyOutput
    });
  }

  const ns2Adapter = createNs2FamilyAdapter(
    'ns2', 'ns-2', 'mobility-ns2.tcl', 'ns-2 Tcl mobility trace'
  );
  const ns3Adapter = createNs2FamilyAdapter(
    'ns3', 'ns-3 Ns2MobilityHelper', 'mobility-ns3.tcl', 'ns-3 Ns2MobilityHelper-compatible trace'
  );

  function inetExtraValidation(scenario) {
    const errors = [];
    const ids = Array.from(new Set(scenario.waypoints.map(point => point.nodeId))).sort((a, b) => a - b);
    ids.forEach((id, index) => {
      if (id !== index + 1) {
        errors.push('INET BonnMotion line-to-host mapping requires contiguous editor nodeIds starting at 1.');
      }
    });
    return Array.from(new Set(errors));
  }

  function validateInetBonnMotionOutput(text, expectedScenario) {
    const errors = [];
    const paths = [];
    const stride = expectedScenario?.waypoints.some(p=>Math.abs(p.z)>EPSILON) ? 4 : 3;
    const lines = String(text).split(/\r?\n/);
    if (lines.some(line => !line.trim())) errors.push('INET BonnMotion output must not contain blank lines.');
    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('#')) {
        errors.push(`INET BonnMotion line ${lineIndex + 1} must not contain comments.`);
        return;
      }
      const values = trimmed.split(/\s+/).map(Number);
      if (values.length % stride !== 0 || values.length < stride || values.some(value => !Number.isFinite(value))) {
        errors.push(`INET BonnMotion line ${lineIndex + 1} must contain numeric ${stride === 4 ? "t x y z quadruples" : "t x y triplets"}.`);
        return;
      }
      const path = [];
      for (let i = 0; i < values.length; i += stride) {
        path.push({ time: values[i], x: values[i + 1], y: values[i + 2], ...(stride === 4 ? {z:values[i+3]} : {}) });
      }
      for (let i = 1; i < path.length; i++) {
        if (path[i].time <= path[i - 1].time) {
          errors.push(`INET BonnMotion times on line ${lineIndex + 1} must be strictly increasing.`);
        }
      }
      paths.push(path);
    });
    if (!paths.length) errors.push('INET BonnMotion output contains no host paths.');
    if (expectedScenario) {
      const expectedHosts = new Set(expectedScenario.waypoints.map(point => point.nodeId)).size;
      if (paths.length !== expectedHosts) errors.push(`Expected ${expectedHosts} INET host lines, found ${paths.length}.`);
    }
    return { valid: errors.length === 0, errors, paths };
  }

  const inetAdapter = Object.freeze({
    id: 'omnetpp',
    label: 'INET/OMNeT++ BonnMotion',
    filename: 'mobility-bonnmotion.movements',
    mimeType: 'text/plain',
    outputHint: 'INET BonnMotionMobility (t x y, or t x y z with is3D=true)',
    warnings(scenario) { return scenario.waypoints.some(p=>Math.abs(p.z)>EPSILON) ? ['This trace includes Z. Set is3D=true in each consuming INET BonnMotionMobility module.'] : []; },
    validate(scenario) {
      return validateCanonicalScenario(scenario).concat(inetExtraValidation(scenario));
    },
    serialize(scenario) {
      assertScenario('omnetpp', scenario, inetExtraValidation);
      const groups = groupByNode(scenario);
      const ids = Array.from(groups.keys()).sort((a, b) => a - b);
      const text = ids.map(nodeId => {
        const values = [];
        groups.get(nodeId).forEach(point => {
          const mapped = simulatorPoint(point);
          const time = scenario.scenario === 'fixed' ? 0 : point.time;
          values.push(formatNumber(time), formatNumber(mapped.x), formatNumber(mapped.y));
          if(scenario.waypoints.some(p=>Math.abs(p.z)>EPSILON)) values.push(formatNumber(mapped.z));
        });
        return values.join(' ');
      }).join('\n');
      const report = validateInetBonnMotionOutput(text, scenario);
      if (!report.valid) throw new AdapterValidationError('omnetpp', report.errors);
      return text;
    },
    validateOutput: validateInetBonnMotionOutput
  });

  const adapters = Object.freeze({
    cooja: coojaAdapter,
    ns2: ns2Adapter,
    ns3: ns3Adapter,
    omnetpp: inetAdapter
  });

  function getAdapter(id) {
    const adapter = adapters[id];
    if (!adapter) throw new AdapterValidationError(String(id), [`Unknown simulator adapter: ${id}`]);
    return adapter;
  }

  function createArtifact(adapterId, scenario) {
    const adapter = getAdapter(adapterId);
    const text = adapter.serialize(scenario);
    const conformance = adapter.validateOutput(text, scenario);
    if (!conformance.valid) throw new AdapterValidationError(adapter.id, conformance.errors);
    return {
      adapterId: adapter.id,
      filename: adapter.filename,
      mimeType: adapter.mimeType,
      text,
      conformance,
      warnings: adapter.warnings ? adapter.warnings(scenario) : []
    };
  }

  return Object.freeze({
    AdapterValidationError,
    adapters,
    getAdapter,
    createArtifact,
    validateCanonicalScenario,
    validateCoojaOutput,
    validateNs2FamilyOutput,
    validateInetBonnMotionOutput
  });
});
