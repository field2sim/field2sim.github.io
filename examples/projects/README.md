# Field2Sim project examples

Open the web app and choose **Examples → Central Park · sensors + mobile collector**, or use **Open Project** to select `central-park.field2sim`.

This illustrative authoring scenario contains six static sensors (IDs 1–6) and one mobile collector (ID 7, eight waypoints) near Central Park's Great Lawn in New York. The route timestamps are based on approximately 1.5 m/s between the chosen waypoints. It is a synthetic example, not a surveyed deployment, permission to install sensors, or a validated pedestrian route. The project uses 2D coordinates and has path-loss disabled.

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
