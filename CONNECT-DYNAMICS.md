<!-- Product: God's Eye View — Dynamics | Tagline: Real-time view of your fleet in the field | Dataverse is not the marquee -->
# God's Eye View - Dynamics

**NukaSoft open-source fork** of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).

## Why this fork exists

What if dispatch, field service, and every GPS-located Dynamics business record lived on the same living globe as traffic, cameras, and the real world?

**God's Eye View - Dynamics** is a showcase for the Microsoft Dynamics / Power Platform community:

- See accounts, service locations, assets, work orders, and bookable resources on a photorealistic 3D globe
- Keep public context layers (traffic, cams, weather-adjacent signals) beside your Dataverse truth
- Cut time-to-value for "where is my work / where are my people / what is around this site"
- Source is public. Contribute. Fork. PR. If you help build it, you have the code.

This is not a closed ISV black box. It is a community-shaped bridge from OSINT-grade geospatial UX into Dynamics 365 business applications (Field Service first).

## Stack intent

- Upstream GEV: Cesium globe + live public layers (MIT)
- NukaSoft layer: Dataverse / Field Service via GeoJSON adapter (Entra app user, secrets out of the browser)
- Skin: NukaSoft + clear Dynamics/Power Platform product framing

## Upstream

- origin = this fork (ship + version)
- upstream = bilawalsidhu/gods-eye-view (portable PRs welcome both ways)

## Status

Early public versioning. Demo data only until security pass. No customer PHI. No live tech GPS in public builds until consent model is locked.

Repo: https://github.com/NukaSoft/gods-eye-view

## Layer module (eggbot 2026-09-09)
- src/data/dataverseFs.js — Cesium overlay via local GeoJSON loader
- Sample: public/samples/dataverse-fs-ww-demo.geojson`r
- Env: VITE_DATAVERSE_FS_GEOJSON_URL (adapter URL); default = sample
- Toggle appears with other local data layers (Dynamics Field Service)
