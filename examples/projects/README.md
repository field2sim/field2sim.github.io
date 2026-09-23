# Field2Sim project examples

Open **Project → Examples** in the web app, or select a `.field2sim` file with **Open Project**.

| Example | Static group | Mobile group | Route speed |
| --- | --- | --- | --- |
| [Central Park, New York](central-park.field2sim) | 6 park sensors | 1 collector, 8 waypoints | 1.5 m/s (5.4 km/h) |
| [Mutianyu Great Wall, China](great-wall-mutianyu.field2sim) | 6 wall-monitoring sensors | 1 inspection drone, 35 waypoints | 49.11 m/s (176.81 km/h), average |
| [Saint-Émilion vineyard, France](saint-emilion-vineyard.field2sim) | 12 vineyard sensors in three rows | 1 data collector, 10 waypoints | 1.5 m/s (5.4 km/h) |
| [Giza Plateau, Egypt](giza-plateau.field2sim) | 8 heritage-monitoring sensors | 1 survey collector, 13 waypoints | 3 m/s (10.8 km/h) |

Each project opens with two named groups and the mobile group selected. Except for Great Wall, route times are cumulative geographic segment lengths divided by the listed speed, rounded to milliseconds. Great Wall preserves the user-supplied 0–34 s timestamps at one-second intervals; its segment speeds vary, and the listed speed is the route average. Its preview opens at 1×; the six static sensors retain their original positions. The three landmark examples use mobile node ID 1 and static IDs starting at 2; Central Park retains its original static IDs 1–6 and collector ID 7. Cooja exports all groups; other adapters export the selected group and apply their ID requirements.

These are synthetic authoring examples at recognizable geographic sites, not measured deployments or validated navigation routes. All open in 2D with path-loss disabled and Street as the background, without requiring an imagery key or elevation request. The drone example represents a horizontal inspection trajectory near the wall; it contains no flight altitude or terrain-clearance plan. Enabling 3D fetches surface elevations, not drone height above ground.

### Geographic context

- **Mutianyu:** 35 user-supplied route coordinates along the Great Wall, replacing the initial approximate route. Coordinates and timestamps are preserved as supplied; this remains an illustrative, unsurveyed scenario.
- **Saint-Émilion:** a synthetic vineyard plot near [Château-Figeac](https://www.guide-bordeaux-gironde.com/en/tourism/tasting/wines/vineyard-tours/saint-emilion-391/chateau-figeac-10749.html), whose published reference point is approximately 44.91282, −0.19244. Sensor rows and collector passes illustrate agricultural data collection; they do not reproduce estate parcel boundaries or claim an actual deployment there.
- **Giza:** an illustrative monitoring route around the pyramid area, with the [Great Pyramid](https://commons.wikimedia.org/wiki/Great_Pyramid_of_Giza) as its geographic reference. Paths and access permissions are not inferred from these waypoints.

Open **Route playback · prototype** and press Play. Playback shows all mobile groups on one timeline. The speed selector changes preview speed only; it does not edit route timestamps. Static nodes stay visible. Groups are hidden before their first timestamp, interpolate linearly between waypoints, and hold their last position after their final timestamp. The preview does not emulate packet reception, radio propagation, terrain following, or simulator-specific cycle behavior.

Use **Save Project** to download your edited scenario as a `.field2sim` file. Opening a project or example replaces the current workspace; Undo restores the previous workspace.

## Portable file contents

The JSON document uses `format: "field2sim-project"` and `version: 1`. It includes:

- All named node groups, IDs, waypoint times, geographic coordinates, stored heights, altitude-reference labels, and raw input drafts.
- Group intervals and polygons, unfinished polygon vertices, active group, work mode, and scan direction.
- Shared origin policy and coordinates, 2D/3D and auto-numbering checkboxes, circle radius, selected simulator, and node-entry defaults.
- Path-loss enablement, environment/profile selection, TX/INT ranges, success ratio, sensitivity, RSSI inflection, profile exponent, noise, time variation, and seed.
- Map view/background, location-search text, group-panel/detail visibility, preview speed and time (restored paused).
- Elevation source records for project points and the selected CSC's name and XML content, if any.

API keys, filesystem handles/write permissions, firmware binaries, background imagery, and undo history are not embedded. A restored CSC is a copy: select the original again to overwrite it. Its external firmware/file references still need the corresponding files on the target computer. Provider backgrounds need an available key on that installation; otherwise Street is shown. Stored heights are retained on open without an automatic elevation request. Export preview is cleared and regenerated only by Convert.

Project imports validate the file signature, version, geometry and settings before applying changes. The current import/export size limit is 25 MB. Draft input can be saved before it is valid; simulator conversion and route playback still validate the relevant rows.

## Playback inspection and average speed

Playback tags appear above/right of each moving node with ID, time, current segment speed, waypoint index and coordinates (altitude when 3D export is enabled). Speed is the geographic segment distance divided by its original time interval, independent of the preview multiplier. A faint full route and a colored completed trail show progress. Previous/next waypoint buttons use the selected mobile group while all mobile groups share the same clock. **Loop** restarts the common timeline after its longest route; it affects preview only and does not configure a simulator's looping behavior.

For a mobile route, **Average Speed: x m/s (y km/h)** below the coordinate input displays total segment distance divided by last minus first waypoint time, including pauses. Geographic distance uses a spherical approximation (radius 6,371,000 m), with segment height differences included only when 3D export is enabled. This display does not modify coordinates or timestamps. Static/empty input hides it; incomplete or invalid timing displays a dash.
