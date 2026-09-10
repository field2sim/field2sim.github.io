# Surface elevation lookup

Automatic elevation lookup queries all groups independently of the simulator selector. Only status text and the source/license link are shown below the geographic input. Static nodes and mobile waypoints, whether
entered manually or generated in a polygon, use the same geographic query path.

Automatic lookup is disabled by default. Enable 3D export (experimental), above the geographic input, enables it for all groups. With this checkbox off, no automatic elevation queries are sent and exported Z is zero. Disabling it cancels pending browser work; a request already received by the server may still consume quota. The checkbox and pre-toggle input state participate in Undo/Redo. Placement, coordinate edits and completed movement trigger a debounced query (350 ms; at least 1.1 s between browser request starts). Polygon points are batched. Height-only edits and map navigation do not trigger lookups. Failed requests are not automatically retried for unchanged geometry. Coordinates are sent to
`https://iotlab.omu.edu.tr/elevation/v1/elevation`, then to OpenTopoData's Mapzen
endpoint as necessary. Unique coordinates are batched in groups of at most 100.
Requests are sequential; errors and Retry-After are displayed without automatic
retries. Cancel aborts the browser request; a server request already running may
still consume upstream quota. Multi-batch results are committed only on success.

Successful results fill the existing geographic input fifth column (altitude in metres), with undo support. A separate duplicate table is not displayed. NoData retains the previous input value. Queries interrupted by edits do not overwrite the draft. Fetched heights are exported as origin-relative Z (input altitude minus origin altitude). They are indexed
by exact coordinates, so moving a point does not reuse its previous elevation.
Browser storage retains up to 20,000 locations, with a 30-day usability limit
(one hour for NoData). Expired records are not displayed/reused; records may remain
on disk until replaced or browser site data is cleared. Clear the site's browser
storage to remove them. Server retention and shared limits are documented at
https://iotlab.omu.edu.tr/elevation/metadata.

Horizontal projection uses zero height for both geographic points and origin; source-dependent Mapzen heights are not treated as WGS84 ellipsoidal heights. Z remains input altitude minus origin altitude, in metres. No geoid conversion is claimed.

Cooja static CSC positions include Z. Mobile positions.dat retains its fifth Z column, although the tested Mobility plugin ignores it. ns-2/ns-3 initialize Z_ and schedule subsequent height changes at waypoint timestamps, with XY setdest motion; The intended Z updates are stepwise rather than interpolated. Real ns-2 checks passed; ns-3.47 Ns2MobilityHelper changing-Z checks failed because scheduled coordinate assignments reset positions. The ns-3 consumer requires further investigation, and the UI labels this export experimental. INET emits t/x/y/z quadruples when Z is nonzero and requires is3D=true; zero-Z exports retain the existing 2D format.

Consumer references: https://www.nsnam.org/doxygen/d2/d32/classns3_1_1_ns2_mobility_helper.html and https://doc.omnetpp.org/inet/api-current/neddoc/inet.mobility.single.BonnMotionMobility.html

Source attribution: **Elevation: OpenTopoData / Mapzen — sources and licenses**
https://iotlab.omu.edu.tr/elevation/license

Mapzen combines terrain, surface and bathymetric sources with differing licenses
and resolutions. Its documented v1.1 is provider-declared, not attested in each API
response. Grid spacing is not vertical accuracy. Negative elevations are retained.

Validation: mocked client tests cover batching, duplicate coordinates, negative
values, NoData, invalid responses, 429 and cancellation. Browser tests cover static
and mobile groups, all-group scope, moving coordinates, cache and persistence,
with fifth-column fill and elevation export. Existing coordinate/adapter tests remain applicable.

## Convert UI verification (2026-09-10)

All four targets are covered for static/mobile, manual/fetched-height input, and 2D/3D mode (32 combinations).
All 32 conversion combinations pass. These are browser export tests,
not simulator execution or validation of elevation-aware simulations.

Cooja import inverts horizontal zero-height projection on the near side of WGS84 and reconstructs altitude as imported Z plus origin altitude. Reusing the export origin is required for geographic round trips. With no custom origin, map center and altitude zero become the import origin. Imported heights are retained until a geometry change triggers lookup. Numerical round trips and tests/elevation-import.browser.test.cjs cover the new inverse path.
