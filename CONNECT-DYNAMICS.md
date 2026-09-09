# Connect to Dynamics with God's Eye

**NukaSoft fork** of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).

## What this fork adds

Field Service / Dataverse dispatch on the same globe as public OSINT layers (traffic, cams, weather context):

- Customers (accounts)
- Service locations (functional locations)
- Assets
- Open work orders
- Bookable resources (live GPS = later phase)

Architecture: Dataverse Web API → GeoJSON adapter → Cesium layer (`src/data/dataverseFs.js`). Secrets never in the browser bundle or this git repo.

## Upstream

- `origin` = this NukaSoft fork (ship + version here)
- `upstream` = bilawalsidhu/gods-eye-view (PRs back when slices are portable)

## Status

Scaffold / versioning kickoff. WW-DEMO only until security pass. No PHI.
