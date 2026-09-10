(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Field2SimCoordinateCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // WGS84 ellipsoid constants.
  const WGS84_A = 6378137.0;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_E2 = WGS84_F * (2 - WGS84_F);
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  function assertFinite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  }

  function validateGeodetic(point, label = 'point') {
    if (!point || typeof point !== 'object') throw new TypeError(`${label} is required`);
    assertFinite(point.lat, `${label}.lat`);
    assertFinite(point.lng, `${label}.lng`);
    if (point.lat < -90 || point.lat > 90) throw new RangeError(`${label}.lat must be in [-90, 90]`);
    if (point.lng < -180 || point.lng > 180) throw new RangeError(`${label}.lng must be in [-180, 180]`);
    if (point.alt != null) assertFinite(point.alt, `${label}.alt`);
  }

  function geodeticToEcef(point) {
    validateGeodetic(point);
    const lat = point.lat * DEG_TO_RAD;
    const lng = point.lng * DEG_TO_RAD;
    const alt = point.alt == null ? 0 : point.alt;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLng = Math.sin(lng);
    const cosLng = Math.cos(lng);
    const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    return {
      x: (n + alt) * cosLat * cosLng,
      y: (n + alt) * cosLat * sinLng,
      z: (n * (1 - WGS84_E2) + alt) * sinLat
    };
  }

  function ecefToGeodetic(point) {
    assertFinite(point.x, 'point.x');
    assertFinite(point.y, 'point.y');
    assertFinite(point.z, 'point.z');
    const p = Math.hypot(point.x, point.y);
    const lng = Math.atan2(point.y, point.x);

    if (p < 1e-9) {
      const lat = point.z >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const polarRadius = WGS84_A * (1 - WGS84_F);
      return { lat: lat * RAD_TO_DEG, lng: 0, alt: Math.abs(point.z) - polarRadius };
    }

    let lat = Math.atan2(point.z, p * (1 - WGS84_E2));
    let alt = 0;
    for (let i = 0; i < 10; i++) {
      const sinLat = Math.sin(lat);
      const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      alt = p / Math.cos(lat) - n;
      const next = Math.atan2(point.z, p * (1 - WGS84_E2 * n / (n + alt)));
      if (Math.abs(next - lat) < 1e-14) {
        lat = next;
        break;
      }
      lat = next;
    }

    const normalizedLng = ((lng * RAD_TO_DEG + 540) % 360) - 180;
    return { lat: lat * RAD_TO_DEG, lng: normalizedLng, alt };
  }

  function geodeticToEnu(point, origin) {
    validateGeodetic(point);
    validateGeodetic(origin, 'origin');
    const p = geodeticToEcef(point);
    const o = geodeticToEcef(origin);
    const lat0 = origin.lat * DEG_TO_RAD;
    const lng0 = origin.lng * DEG_TO_RAD;
    const sinLat = Math.sin(lat0);
    const cosLat = Math.cos(lat0);
    const sinLng = Math.sin(lng0);
    const cosLng = Math.cos(lng0);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dz = p.z - o.z;
    return {
      east: -sinLng * dx + cosLng * dy,
      north: -sinLat * cosLng * dx - sinLat * sinLng * dy + cosLat * dz,
      up: cosLat * cosLng * dx + cosLat * sinLng * dy + sinLat * dz
    };
  }

  function enuToGeodetic(enu, origin) {
    assertFinite(enu.east, 'enu.east');
    assertFinite(enu.north, 'enu.north');
    assertFinite(enu.up == null ? 0 : enu.up, 'enu.up');
    validateGeodetic(origin, 'origin');
    const up = enu.up == null ? 0 : enu.up;
    const o = geodeticToEcef(origin);
    const lat0 = origin.lat * DEG_TO_RAD;
    const lng0 = origin.lng * DEG_TO_RAD;
    const sinLat = Math.sin(lat0);
    const cosLat = Math.cos(lat0);
    const sinLng = Math.sin(lng0);
    const cosLng = Math.cos(lng0);
    const dx = -sinLng * enu.east - sinLat * cosLng * enu.north + cosLat * cosLng * up;
    const dy = cosLng * enu.east - sinLat * sinLng * enu.north + cosLat * sinLng * up;
    const dz = cosLat * enu.north + sinLat * up;
    return ecefToGeodetic({ x: o.x + dx, y: o.y + dy, z: o.z + dz });
  }

  // Invert the zero-height horizontal projection on the near side of WGS84.
  // The local Z is an altitude difference, not an ENU up component.
  function localToGeographic(point, origin) {
    ['x', 'y', 'z'].forEach(axis => assertFinite(point[axis], `point.${axis}`));
    validateGeodetic(origin, 'origin');
    const lat = origin.lat * DEG_TO_RAD, lng = origin.lng * DEG_TO_RAD;
    const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lng), co = Math.cos(lng);
    const base = geodeticToEcef({...origin, alt:0});
    const q = [base.x-so*point.x-sl*co*point.y,
      base.y+co*point.x-sl*so*point.y, base.z+cl*point.y];
    const up = [cl*co, cl*so, sl];
    const radii2 = [WGS84_A**2, WGS84_A**2, WGS84_A**2*(1-WGS84_E2)];
    const a = up.reduce((sum,v,i)=>sum+v*v/radii2[i],0);
    const b = 2*up.reduce((sum,v,i)=>sum+v*q[i]/radii2[i],0);
    const c = q.reduce((sum,v,i)=>sum+v*v/radii2[i],0)-1;
    const discriminant = b*b-4*a*c;
    if(discriminant < 0) throw new RangeError('Local XY lies outside the origin’s WGS84 projection.');
    const u = -2*c/(b+Math.sqrt(discriminant));
    const ll = ecefToGeodetic({x:q[0]+u*up[0], y:q[1]+u*up[1], z:q[2]+u*up[2]});
    return {lat:ll.lat, lng:ll.lng, alt:point.z+(origin.alt ?? 0)};
  }

  return Object.freeze({
    WGS84_A,
    WGS84_F,
    WGS84_E2,
    geodeticToEcef,
    ecefToGeodetic,
    geodeticToEnu,
    enuToGeodetic,
    localToGeographic,
    validateGeodetic
  });
});
