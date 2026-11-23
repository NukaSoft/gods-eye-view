# God's Eye View, Dynamics: MVP Winter Build Plan

Status: DRAFT plan for review. Docs only. Nothing in this PR creates Azure resources, changes DNS, signs in anywhere, or writes to any Dataverse environment.
Owner: Pierre Hulsebus (merges, publishes, spends). Builder: eggbot opens PRs. Brand: Rita.
Written: 2026-11-23 (America/Detroit). Base: `main` at `2c0937a` (merge of PR #1, `eggbot/dataverse-fs-layer`, 2026-09-09).

## 0. Goal in Pierre's words

> "I want to just continue the expansion of that solution against our Newcastle dataset and look at how we can fully bake that into a good demo scenario for our West Michigan dataset that we have."

> "God's Eye View is a live version translation of what is sitting in Dataverse on top of public data slices."

> "I want to see if we can pull telemetry from the Michigan Department of Transportation off of their trucks... the MDOT website has truck telemetry on their snow trucks." "Let's figure out how we could put that in."

> "What is the best spot for us to serve this data from? Right now it's kinda wired up to my own home server, but it probably should sit up somewhere in like Azure on my Microsoft account or Vercel or we have Firebase on Amazon or on Google."

> "...help me come up with a build plan for putting it out on Azure, tie it to our The Technical Seller account that business application account cause that has an Azure associated account with it, and all of the stuff that we need. And then we can build a subdomain and all of that kinda stuff. So it just works."

This is Pierre's MVP winter project: a public, shareable, branded God's Eye View that shows NukaSoft (our fictional demo company, our Contoso) Field Service work in West Michigan on the live globe, beside public MDOT data, during a lake-effect storm.

## 1. What the code does today (grounding)

Read from this repo at `2c0937a`. The plan is built on these facts, not on assumptions.

| Fact | Where | What it means for the plan |
| --- | --- | --- |
| Build tool is Vite 6 (`vite build`, `vite preview`), Cesium via `vite-plugin-cesium`. Node engines `>=24.14.0 <25 \|\| >=26 <27`. CI runs Node 24.14.0 and 26.x. | `package.json`, `.github/workflows/ci.yml` | Frontend is a static build. The Azure build step must pin Node 24. |
| The FS layer is `src/data/dataverseFs.js`. It loads one GeoJSON URL through `createLocalGeoJsonLayer`, normalizes it (`normalizeDataverseFsCollection`), and keeps only kinds `customer, site, asset, workorder, resource, contact, trail`. Points and `LineString` trails are supported. | `src/data/dataverseFs.js` | The demo scenario is "just" a richer GeoJSON. Trails already render. No new kinds are needed for the MVP. |
| The URL comes from `import.meta.env.VITE_DATAVERSE_FS_GEOJSON_URL`, default `/samples/dataverse-fs-ww-demo.geojson`. | `dataverseFs.js` `resolveGeoJsonUrl()` | `VITE_` values are baked in at build time. The Azure build must set it to a stable URL (recommended: the public Blob URL of `packs/nukasoft-wm/live.geojson`, see Section 5). |
| Properties already understood: `status, priority, updated, staleSec, resourceId, siteId, siteName, accountName, dynamicsUrl, imageUrl, characteristics, workHourStart, workHourEnd, wo, ...` | `dataverseFs.js` | The export can carry freshness (`updated`, `staleSec`) and deep links (`dynamicsUrl`) without code changes. |
| The sample is 7 features in downtown Grand Rapids: `WW Demo Municipal Utilities` (customer), `WW Site, River Pump Station` and `WW Site, North Substation` (functional locations), `Pump P-12` (asset), `WW-DEMO-001` high and `WW-DEMO-002` normal (work orders), `WW Tech A (demo)` (resource). IDs are placeholder GUIDs `00000000-...`. (The sample file separates "WW Site" and the site name with a dash character; this doc writes a comma.) | `public/samples/dataverse-fs-ww-demo.geojson` | The West Michigan scenario grows from these names. Real record IDs must be mapped from the env in Phase 5. |
| `.env.example` shows the current live source: `VITE_DATAVERSE_FS_GEOJSON_URL=http://192.168.10.138:8788/geojson?at=12:15` (HOTROD LAN "day-sim"). The day-sim service code is not in this repo. | `.env.example` | This is the "home server" dependency to retire. The day-sim logic should move into the Azure demo agent (Section 8). |
| Location-pack swap pattern: `CCTV_SOURCES_FILE` (default `config/cctv_sources.austin.json`) or inline `CCTV_SOURCES_JSON`. Austin and Shinjuku packs share one schema: `id, name, city, provider, feedType, url, lat, lon, headingDeg, pitchDeg, fovDeg, rangeM, license`. | `config/`, `vite.config.js` line ~3519, `scripts/dev-cctv.sh` | A Michigan pack (`config/cctv_sources.michigan.json`) can follow the same schema. MDOT stills are `feedType` image, not video. |
| 26 server routes (`/api/cctv`, `/api/tomtom`, `/api/ais-live`, `/api/opensky`, `/api/realtime/token`, and others) live in Vite `configureServer` / `configurePreviewServer` middleware inside `vite.config.js`. | `vite.config.js` | **Important:** a static deploy drops all of these. Layers that depend on them go dark on Azure unless a route is ported to Functions. The MVP ports only what the demo needs (Section 3). |
| Product framing: "No live tech GPS in public builds until consent model is locked." | `CONNECT-DYNAMICS.md` | The demo agent's positions are simulated, so the public build labels them "Simulated demo positions". No real person's GPS is ever exported. |
| Skin already uses Nuka Red `#C41E24`, Cream Ivory `#F5E6C8`, Cola Brown `#3D1C0B`, Brass `#8B6914`, Aged Paper `#E8DCC8`. | `style-nukasoft-dynamics.css`, `docs/NUKASOFT-SKIN.md` | Brand work is a refresh, not a rebuild (Section 9). |

## 2. Azure resource layout

### 2.1 Recommendation

Two compute pieces, one storage account, one vault, one monitor:

| Resource | Proposed name | Plan / SKU | Job |
| --- | --- | --- | --- |
| Resource group | `rg-tts-gev-prod-eus2` | n/a | Holds everything below. One RG = one delete button. |
| Static Web App | `swa-tts-gev-prod` | **Free** to start | Hosts the Vite build. Managed Functions (HTTP only) under `/api` for the thin proxies the browser needs. |
| Function App | `func-tts-gev-jobs-prod` | **Flex Consumption**, Linux, Node 22 or later supported runtime, 512 MB instance | All timers: MDOT cache refresh, Dataverse to Blob export, demo agent. Uses managed identity. Not linked to the SWA, no public HTTP routes except the platform admin endpoint. |
| Storage account | `sttsgevprod` | StorageV2, Standard LRS, Hot | Blob containers below. Also the Function App host storage. |
| Key Vault | `kv-tts-gev-prod` | Standard | Dataverse app credential (certificate). Nothing secret ever goes to the browser or to this repo. |
| Application Insights + Log Analytics | `appi-tts-gev-prod`, `log-tts-gev-prod` | Pay as you go, daily cap set | Logs for both SWA API and the Function App. |

Region: `eastus2` proposed (Flex Consumption is not in every region; confirm at create time against the supported-regions list).

**Why SWA managed Functions plus a separate Function App, not one or the other.** Per Microsoft Learn, SWA managed Functions are HTTP-trigger only, have no managed identity, and no Key Vault references; bring-your-own Functions (all triggers, managed identity) require the SWA **Standard** plan ([API support in SWA](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions), [SWA hosting plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans)). The demo needs timers and a credential to Dataverse, so a real Function App is required anyway. Keeping it *unlinked* (it only writes Blobs) lets the SWA stay on Free. The browser never talks to the Function App.

**Why Flex Consumption.** Microsoft Learn calls Flex Consumption "the recommended serverless hosting plan for Azure Functions" ([Flex Consumption](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)). Note two limits that matter here: it is Linux only, and `WEBSITE_TIME_ZONE` / `TZ` are not supported, so all timer CRON strings are UTC and the code converts to America/Detroit itself.

### 2.2 Blob containers

| Container | Access | Contents |
| --- | --- | --- |
| `packs` | Public read (anonymous blob read) | `nukasoft-wm/storm-day-v1.geojson` (static scripted scenario), `nukasoft-wm/live.geojson` (export from Dataverse, overwritten every run), `mdot/cameras-michigan.json` (cached camera list). Demo data only, safe to be public. |
| `mdot-cache` | Private | Cached camera still images, keyed `cam/<objectId>/<yyyymmddHHmm>.jpg`, short life. |
| `agent-state` | Private | Demo agent run lock, last run marker, route cursor snapshot. |
| `agent-logs` | Private | Append blobs, one per UTC day: `positions/yyyy/mm/dd.jsonl`, `activity/yyyy/mm/dd.jsonl`. |
| `exports-archive` | Private | Daily copy of `live.geojson` at 23:59 Detroit for replay ("what did yesterday look like"). |

Lifecycle rule (management policy on the storage account): `agent-logs` and `exports-archive` move to Cool at 30 days and to Cold at 90 days; deletion age is an open decision (Section 11). `mdot-cache` deletes after 2 days. Logs are small (estimate under 1 MB per day), so growth is not a cost driver.

### 2.3 Naming and tags

Pattern: `<type>-tts-gev-<env>[-<region>]`, following Microsoft's Cloud Adoption Framework abbreviations (`rg`, `swa`, `func`, `st`, `kv`, `appi`, `log`). `tts` = The Technical Seller. Storage account names cannot contain dashes, hence `sttsgevprod`.

Required tags on every resource:

| Tag | Value |
| --- | --- |
| `owner` | `pierre` |
| `business` | `The Technical Seller` |
| `project` | `gods-eye-view` |
| `env` | `prod` (or `dev`) |
| `cost-center` | `TBD (Pierre)` |
| `data-class` | `public-demo` |
| `repo` | `NukaSoft/gods-eye-view` |

Subscription ID: **TBD (Pierre)**. Entra tenant ID of The Technical Seller account: **TBD (Pierre)**. These are not guessed here and must not be committed to the repo; they live in GitHub environment variables set by Pierre.

### 2.4 Infrastructure as code

eggbot opens a PR with `infra/main.bicep` plus `infra/main.parameters.example.json` (no IDs, no secrets) and a GitHub Actions workflow that only runs `what-if` until Pierre adds the deployment credential (OIDC federated credential on a deployment app, no stored secret). Deploy runs only on manual `workflow_dispatch` after Pierre approves.

### 2.5 Rough monthly cost (estimate)

All numbers are estimates from public pricing pages read on 2026-11-23; verify in the Azure pricing calculator before Pierre approves spend.

| Item | Basis (cited) | Estimate |
| --- | --- | --- |
| SWA Free | Free plan: 100 GB bandwidth per subscription, 250 MB per app, 2 custom domains, managed Functions ([quotas](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas), [pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/)) | $0. Hard stop if 100 GB is exceeded on Free (site stops serving). |
| SWA Standard (only if needed) | Per app per month fee, SLA, BYO Functions, 100 GB then per GB overage (same pages) | Fixed monthly fee; check the pricing page at decision time. |
| Function App, Flex Consumption | Free grant of 250,000 executions and 100,000 GB-s per month per subscription, on demand ([Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/)) | About $0. See 8.9 for the math. |
| Storage, Hot LRS, a few GB | Standard Blob pricing | Under $1. |
| Key Vault | Per 10k operations | Under $1. |
| App Insights / Log Analytics | Per GB ingested; set a daily cap of 0.1 GB | Under $5 with the cap. |
| Map tiles (Google Photorealistic 3D, Cesium ion) | Provider terms; README notes metered keys for public deploys | **Unknown, the largest risk.** Decision in Section 11. |

Expected Azure total on the Free SWA path: single-digit dollars per month, excluding map tile keys.

## 3. MDOT integration

### 3.1 Live check (2026-11-23 18:12:48 EST, 2026-11-23T23:12:48Z)

Endpoint: `https://services2.arcgis.com/67lKNkQ2TO1I3lhR/ArcGIS/rest/services/MiDrive%20Cameras/FeatureServer/0`

| Check | Result |
| --- | --- |
| Layer name / geometry | `MiDriveCameras`, `esriGeometryPoint` |
| Count (`returnCountOnly`) | **681** features (the earlier note said about 800; today's count is 681) |
| Spatial reference | WKID 4326 (WGS84); extent x -89.95 to -82.44, y 41.76 to 47.39 |
| Fields | `OBJECTID` (OID), `Route`, `County`, `Lat`, `Lon`, `Location`, `Direction`, `Image` (all strings except OID and the doubles) |
| Image URL field | `Image` |
| Image hosts | `micamerasimages.net` 598 rows, `mdotcf.state.mi.us` 83 rows |
| Query formats | JSON, geoJSON, PBF; `maxRecordCount` 2000 (one request gets everything) |
| CORS on the FeatureServer | Yes. With `Origin` sent: `access-control-allow-origin: *` |
| Cache headers | `cache-control: public, max-age=30, s-maxage=30` |
| Data freshness of the list | `dataLastEditDate` 2021-01-14 (camera inventory is static; only the images change) |
| Esri rate header | `x-esri-org-request-units-per-min: usage=76;max=6000` |
| `micamerasimages.net` stills | `thumbs/...flv.jpg` URLs 301 redirect to `/<cam>.jpg`, then 200 `image/jpeg` (10 to 36 KB), `Last-Modified` equal to the request time (live), `X-Frame-Options: SAMEORIGIN`, **no CORS header**. 5 of 5 sampled returned 200. |
| `mdotcf.state.mi.us` stills (RWIS) | `http://` only (mixed content on an HTTPS site), **6 of 6 sampled returned HTTP 500** |
| `micamerasimages.net/robots.txt` | `User-agent: *` / `Disallow: /` |
| West Michigan coverage | Kent County 72, Muskegon 11, Ottawa 5, Allegan 3; 85 cameras in the Grand Rapids box (-86.3, 42.7, -85.3, 43.2); I-96 74 statewide (18 in Kent); US-131 30; M-6 1. Kent routes include I-96, I-196, US-131, M-6, M-37, M-11, M-44, 28th St, 44th St, Division Ave. |

Raw check files: kept on the builder box, not committed.

### 3.2 Approach: proxy plus cache, not direct

| Option | Verdict |
| --- | --- |
| Browser calls the FeatureServer directly | Works (CORS `*`), but ties every viewer to MDOT's server, exposes no cache, and returns the dead `http://mdotcf` rows. Fine for a dev spike only. |
| Browser hotlinks `micamerasimages.net` stills | `<img>` would load, but Cesium needs CORS to draw an image as a WebGL texture, and the host sends none. Also `robots.txt` disallows all automated access and every viewer would hit MDOT's image host. **Not recommended.** |
| **Function timer caches the list, SWA proxy serves stills on demand (recommended)** | The camera list is fetched once a day (it has not changed since 2021), filtered to working `https://` rows, normalized to the CCTV pack schema, and written to `packs/mdot/cameras-michigan.json`. Stills are fetched by a SWA managed Function `/api/mdot/still/{objectId}` only when a user opens a camera, cached 60 seconds in memory and in `mdot-cache`, and served same-origin (so Cesium can texture them). Only IDs from the cached list are allowed (no open proxy, same SSRF stance as the existing `/api/cctv`). |

Refresh cadence: camera list daily at 09:00 UTC; stills on demand, 60 second cache (MDOT's own header is 30 to 60 seconds). Storm mode can drop to 30 seconds for the I-96 Kent set only.

Attribution and terms: every MDOT element carries "Source: Michigan Department of Transportation, MiDrive" and a link to MiDrive. MDOT's terms of use for reusing camera images in a third-party site were not found in this check. Because of the `robots.txt` and the hotlink question, Phase 4 starts with **link-out only** (camera pins with a "View on MiDrive" link) and turns on proxied stills only after Pierre decides (Section 11). Add an entry to `DATA_SOURCES.md` either way.

### 3.3 Plow AVL and Winter LOS

- **Live plow positions are not public.** Per Pierre's Nov 23 research, MDOT truck AVL sits behind contractor-owned servers, not on public ArcGIS REST. The MiDrive site shows plow info to people, but there is no documented public feed. This plan does not scrape it.
- **Winter Level of Service layer** (`mdotgis.state.mi.us`): the query endpoint is broken server-side per the same research (not re-tested in this check). Plan treats it as unavailable; a Function can probe it weekly and log the result.
- **Pattern reference:** PennDOT publishes plow AVL as a public ArcGIS FeatureServer. If Michigan ever does, the same proxy plus cache pattern applies: a 60 second timer writes `packs/mdot/plows.geojson` with `updated` and `staleSec`, and the existing trail rendering draws plow paths.
- **Until then,** the storm story shows MDOT cameras on I-96 and US-131 (real) beside NukaSoft trucks (simulated, labeled). If Pierre wants plows on screen, they are drawn as a clearly labeled "Simulated MDOT plow route" layer; never presented as MDOT data.

## 4. West Michigan scenario arc

NukaSoft is the fictional company. All customers, techs and work orders are fictional. Places are real public places used as map anchors only; no real business is named as a NukaSoft customer. Coordinates below are approximate anchors to be snapped with a geocoder and checked against the 3D tiles in Phase 3.

### 4.1 Story: "Lake-effect Tuesday"

A lake-effect band comes off Lake Michigan at Grand Haven mid-morning and tracks east along I-96 toward Grand Rapids by early afternoon. NukaSoft crews are running their normal day of pump, substation and stormwater inspections. As the band arrives, a pump station alarm creates an emergency work order, a tech on US-131 is rerouted, and a stormwater BMP inspection is canceled for safety. MDOT cameras along I-96 and US-131 show the real road conditions beside the NukaSoft fleet.

### 4.2 Anchor places (approximate)

| Anchor | Use | Lat, Lon (approx) |
| --- | --- | --- |
| NukaSoft HQ (fictional pin, Kentwood industrial area near M-37 / 44th St) | Start and end of every tech day | 42.869, -85.594 |
| Downtown Grand Rapids (existing sample sites: River Pump Station, North Substation) | Core customer `WW Demo Municipal Utilities` | 42.961 to 42.966, -85.666 to -85.670 |
| Grand Rapids Water Resource Recovery Facility area (Market Ave SW) | Pump and process asset site | 42.945, -85.681 |
| I-96 / US-131 interchange (north GR) | Route node, MDOT cameras | 42.992, -85.675 |
| M-6 / US-131 interchange (Wyoming) | M-6 ring node | 42.851, -85.668 |
| M-6 / I-196 interchange (Jenison / Hudsonville) | M-6 ring west node | 42.863, -85.832 |
| M-6 / I-96 east end (Cascade Twp) | M-6 ring east node | 42.885, -85.488 |
| Gerald R. Ford International Airport area | Substation-type site east side | 42.881, -85.523 |
| Grand Valley State University, Allendale | Stormwater BMP site (campus ponds, public) | 42.964, -85.889 |
| Grand Haven, south pier | Storm origin camera / weather marker | 43.057, -86.256 |
| Holland, Windmill Island Gardens area | Lakeshore stormwater site | 42.799, -86.096 |
| Rockford (US-131 north) | North route end | 43.120, -85.560 |

### 4.3 Features to author

| Kind | Count (v1) | Notes |
| --- | --- | --- |
| customer | 4 | `WW Demo Municipal Utilities` (existing), plus three fictional: Lakeshore Drain Commission (fictional), Kent Metro Power Co-op (fictional), Allendale Campus Facilities (fictional) |
| site (functional location) | 10 | Existing two plus eight across the anchors |
| asset | 3 to 5 per site (about 35) | Pumps, VFDs, transformers, breakers, stormwater BMPs (detention pond outlet, hydrodynamic separator, bioretention cell). Existing `Pump P-12` keeps its ID. |
| resource | 6 techs | `WW Tech A (demo)` plus five more fictional names. Each has `workHourStart`/`workHourEnd`, `characteristics`, `organizationalUnit` |
| workorder | 12 to 24 per day (2 to 4 per tech) | States across the day: Scheduled, In Progress, Completed, one or two Canceled, timestamps in `updated` |
| trail | 1 per tech per day | `LineString` along authored route legs, matching the movement model |

### 4.4 Timeline (Detroit time, storm day)

| Time | Event |
| --- | --- |
| 07:00 | Techs leave HQ. All WOs Scheduled. |
| 08:15 | Tech A In Progress at River Pump Station (pump inspection on Pump P-12). |
| 09:30 | Tech C on I-196 to Allendale for a stormwater BMP inspection. |
| 10:30 | Snow band at Grand Haven; Grand Haven MDOT cameras go white. |
| 11:45 | Band reaches Allendale / Jenison on M-6 west. Tech C's second BMP inspection (Holland) is **Canceled** (safety). |
| 12:30 | Emergency WO: lift station alarm at Market Ave SW site. Tech B, on US-131 at the M-6 interchange, is rerouted. |
| 13:30 | Band on I-96 at the US-131 interchange; MDOT I-96 cameras show it. |
| 15:00 | Substation check near the airport Completed by Tech D. |
| 16:30 to 17:30 | All techs drive back to HQ. Final positions = HQ. |

### 4.5 Optional second vertical: stormwater

Same layer, different `characteristics` and asset types: BMP inspections (MS4 style), outfall checks, post-storm debris clearing. Shown by filtering on a `vertical` property (`utilities` or `stormwater`). This shows range without a new code path. It also reuses the stormwater advisory work already in the NukaSoft crew.

## 5. Dataverse read path vs static GeoJSON

| Option | Pros | Cons |
| --- | --- | --- |
| A. Browser calls Dataverse Web API | Truly live | Requires a user sign-in or a token in the browser. Public site cannot do this safely. **Rejected: never expose Dataverse credentials to the browser.** |
| B. SWA managed Function calls Dataverse per page view | Fresh | Managed Functions have no managed identity or Key Vault references, so a secret would sit in app settings; every viewer costs Dataverse API calls; outage of Dataverse breaks the demo. Not recommended. |
| C. **Timer export to Blob (recommended)** | Credential stays in the Function App (Key Vault certificate). The public site reads a static file. Fast, cacheable, survives Dataverse maintenance. | Freshness = export interval. |
| D. Static scripted pack only | Zero dependencies, repeatable for talks | Not "live from Dataverse". |

**Recommendation: C plus D.** `func-tts-gev-jobs-prod` runs `exportFsGeoJson` every 5 minutes: reads the demo records with a read-only query (FetchXML / OData), writes `packs/nukasoft-wm/live.geojson` with `updated` and `staleSec`, and copies a daily snapshot to `exports-archive`. The storm-day static pack (D) stays as a fallback and as the "play the story" mode for MVP talks. The site build sets `VITE_DATAVERSE_FS_GEOJSON_URL` to the public Blob URL of `packs/nukasoft-wm/live.geojson`, and the storage account's Blob CORS rule allows GET from the site origins only. (SWA route rewrites cannot point at an external host, so if same-origin is ever needed, a tiny managed Function `/api/data/live` streams the public blob; it needs no credential.) The HUD shows "Updated N min ago" from the `updated` field.

The export only includes records marked as demo (owned by the demo team or business unit, see 8.3), so nothing outside the demo set can leak to the public file.

## 6. Subdomain and DNS

Live lookups on 2026-11-23 (public DNS, read only):

| Domain | Name servers | Current apex |
| --- | --- | --- |
| `thetechnicalseller.com` | `ns2.wixdns.net`, `ns3.wixdns.net` (Wix) | Wix hosting IPs |
| `nukasoft.ai` | `ns41/ns42.domaincontrol.com` (GoDaddy DNS) | GitHub Pages IPs |

Options: `gev.thetechnicalseller.com` (ties to the Azure account and business) or `gev.nukasoft.ai` (ties to the NukaSoft brand and the existing site). Both work the same way with SWA:

1. Pierre creates the SWA (Phase 2) and copies its `*.azurestaticapps.net` host name.
2. At the DNS host, add `CNAME gev -> <app>.azurestaticapps.net`.
3. In the SWA, Custom domains, add `gev.<domain>`, choose CNAME validation. Azure validates and issues a free managed certificate ([custom domain, external DNS](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external)). Propagation follows the record's TTL.
4. No apex change, no change to the existing Wix or GitHub Pages sites. Neither domain has a CAA record today, so no CAA edit is needed.

Who holds the DNS logins (Wix account, GoDaddy account) is **TBD (Pierre)**. eggbot never edits DNS. SWA Free allows 2 custom domains, so both names can point at the same app if wanted.

## 7. Phased rollout and gates

eggbot opens PRs. Pierre merges, publishes and spends. Each phase ends at a gate; nothing moves past a gate without Pierre.

| Phase | eggbot does (PRs, docs, code) | Gate: Pierre does |
| --- | --- | --- |
| 0. Plan | This PR. | Merge or comment. Answer Section 11. |
| 1. IaC and pipeline | `infra/*.bicep`, `what-if` workflow, `staticwebapp.config.json`, Node 24 build, SWA env `VITE_DATAVERSE_FS_GEOJSON_URL`. No deploy. | Merge. Create the OIDC deployment credential in The Technical Seller subscription. Set a budget alert. |
| 2. First deploy (sample data) | Nothing new; workflow ready. | **Spend + publish:** run the deploy. Site live on `*.azurestaticapps.net` with the existing WW-DEMO sample. |
| 3. Storm-day static pack | `packs/nukasoft-wm/storm-day-v1.geojson`, geocoder-snapped anchors, unit tests for the pack (normalizer accepts every feature), route leg table. | Merge. Upload or let the pipeline publish the pack. |
| 4. MDOT cameras | Timer `refreshMdotCameras`, Michigan CCTV-schema pack, camera pins with MiDrive link-out, attribution, `DATA_SOURCES.md`. Proxied stills behind a flag, off. | Merge, publish. Decide stills on/off. |
| 5. Dataverse read export | Read-only security role spec, `exportFsGeoJson` timer, mapping of sample names to real record IDs (read-only discovery). | Create the app registration and application user (read role) in the NukaSoft tenant; put the certificate in Key Vault. Publish. |
| 6. Custom domain | Runbook only. | Add the CNAME at Wix or GoDaddy; add the domain in SWA. |
| 7. Demo agent, dry run | `demoAgentTick` with `DEMO_AGENT_MODE=dryrun`: computes positions and WO transitions, logs them, **writes nothing to Dataverse**. Custom tables and config in a prefix-owned solution. | Import the solution to the target env (Pierre). Review a few days of dry-run logs. |
| 8. Demo agent, live writes | Flip documented. | **First write to the main NukaSoft tenant is Pierre's go.** Grant write role to the agent's application user, set mode `live`. |
| 9. Brand and share | Rita's skin refresh applied, share page, MVP talk script. | Approve brand (Rita is logo approver), publish, share. |
| 10. Analytics (future) | Own views and dashboards (Section 10). | Import, publish. |

## 8. Demo agent (24/7 movement and daily work orders)

### 8.1 Decided by Pierre (recorded 2026-11-23)

| Item | Decision |
| --- | --- |
| Target environment | The **main NukaSoft demo tenant, `nukasoft.crm.dynamics.com`**, approved by Pierre for this plan (relayed by the parent agent from Pierre's voice conversation; his exact wording was not included in the relay). This decides the plan only: **no writes happen now.** The first deployment and first live write are a Phase 8 gate that Pierre publishes. Never a client tenant; never apexfsdev. |
| Headline | **Bookable resources move first**; customer assets move second. |
| Cadence | **24/7 continuous loop, every few hours, always on by default.** The pause switch is a manual override. |
| Movement | Resources **cycle the pre-authored routes repeatedly**. |
| Daily WOs | A fresh batch every day, **2 to 4 WOs per resource per day by default** (configurable), booked to the moving resources, staggered through the day, progressed through the stock lifecycle, a small fraction Canceled. |
| End of day | The final leg every day returns the tech to NukaSoft HQ, so the last position of the day is the office. |
| Old work orders | "They get closed." Demo work orders are **never deleted or purged**. Each one ends Completed or Canceled and stays in the system. |

### 8.2 Where it runs: Azure Function timer (chosen)

| Option | Fit |
| --- | --- |
| **Azure Function timer on `func-tts-gev-jobs-prod` (chosen)** | Code lives in this repo and goes through PR review and `npm test`. Route interpolation, deterministic schedules and idempotent upserts are plain unit-testable JavaScript. Same app, identity and Key Vault as the export job. Effectively free at this volume (8.9). Timer triggers use a storage lock so only one instance runs even if the app scales out ([timer trigger](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer)). |
| Logic App (Consumption) | Good for connectors, poor for geometry and state machines; logic would live in designer JSON outside normal tests. Per-action billing. |
| Power Automate (cloud flow in the tenant) | Closest to Dataverse, but flows are harder to diff and test, run under a user or service principal connection with Power Platform request entitlements, and a 24/7 flow every 30 minutes is heavier to maintain. Keep Power Automate for in-tenant reactions if ever needed, not for the simulator. |

Note from the timer docs: a failed timer run is not retried until the next schedule. That is fine here because every run reconciles to "where should everything be now" (8.5), so a missed run self-heals on the next one.

### 8.3 Identity and least privilege

- Dedicated Entra **app registration** `NukaSoft GEV Demo Agent` and a Dataverse **application user** in `nukasoft.crm.dynamics.com`. Created by Pierre. Credential: certificate stored in `kv-tts-gev-prod`, read by the Function App's managed identity. No client secret in app settings, no secret in this repo or doc.
- If The Technical Seller Azure tenant differs from the NukaSoft Dataverse tenant, the app registration is multi-tenant or lives in the NukaSoft tenant with the certificate in our Key Vault; confirm in Phase 5 (Section 11).
- **Custom security role** (prefix-owned, `<prefix>_GEV Demo Agent`), scoped to a dedicated **"NukaSoft Demo" business unit / owner team**: all demo resources, assets, WOs and bookings are owned by that team, and the role grants Business Unit level access only. Privileges: read bookable resource, functional location, account (no write on Account), incident type, booking status; create/update work order, resource requirement, bookable resource booking; update customer asset (only if 8.4 option chosen); create geolocation tracking (only if chosen); full CRUD on the agent's own tables. No delete privilege on any stock table.
- Two roles, two phases: Phase 5 export user gets read only; Phase 8 adds the write role.

### 8.4 Where positions are written (field ownership)

Pierre's standing rule: **never touch or bind the out-of-box Account latitude/longitude.** Field Service geocoding owns them. The agent never writes Account, Contact or User address latitude/longitude, and never moves Organizational Unit coordinates (that would move every resource in the unit).

How Field Service places a resource on the schedule board map (Microsoft Learn):
- Current location from the mobile app is stored in **Geolocation Tracking (`msdyn_geolocationtracking`)**: `msdyn_latitude`, `msdyn_longitude`, `msdyn_date`, `msdyn_userid` (lookup to **systemuser**). Expiry is set by "Geo Location Expires After X Minutes" in Scheduling Parameters ([track technician location](https://learn.microsoft.com/en-us/dynamics365/field-service/mobile/track-technician-location), [table reference](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_geolocationtracking)).
- Otherwise the resource's **Start/End Location** (`msdyn_startlocation`: Resource Address, Organizational Unit Address, or Location Agnostic). Resource Address reads latitude/longitude from the related user, account or contact; Organizational Unit Address reads the org unit's latitude/longitude ([set up bookable resources](https://learn.microsoft.com/en-us/dynamics365/field-service/set-up-bookable-resources), [resource types](https://learn.microsoft.com/en-us/dynamics365/field-service/scheduling-resource-types)). `bookableresource` itself has no latitude/longitude columns.
- **Customer Asset** has its own `msdyn_latitude` / `msdyn_longitude` (Double) columns ([msdyn_customerasset](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/msdyn_customerasset)). These are not Account fields.

Design:
1. **Always:** write to our own table `<prefix>_demoposition` (one row per tracked record: target table + record ID as an **alternate key**, `latitude`, `longitude`, `routeid`, `legindex`, `progress`, `heading`, `updatedon`). The GEV export reads this table. Upsert by alternate key means no duplicates, ever.
2. **Option, schedule board shows motion:** also create one `msdyn_geolocationtracking` row per resource per movement step. This only works for **User-type** bookable resources (the lookup is to systemuser), which means demo techs would be users in the tenant. That collides with the "no test users, admin account only" practice used on other builds. **Decision for Pierre** (Section 11).
3. **Option, assets:** write `msdyn_customerasset.msdyn_latitude/longitude` for assets marked mobile (trailer pumps, portable generators). Fixed assets never move. **Decision for Pierre.** Default is own table only.

### 8.5 Movement model

- **Authored routes**, stored as `<prefix>_demoroute` rows (or a JSON file in `agent-state` for v1): ordered waypoint lists that follow real roads, snapped once in Phase 3. v1 routes: `I96-GH-GR` (Grand Haven area to I-96/US-131), `I96-GR-EAST` (US-131 interchange to M-6 east end), `US131-ROCKFORD-WYOMING`, `M6-RING` (I-196 Jenison to US-131 Wyoming to I-96 Cascade), `I196-GR-HOLLAND`, and short city legs to each site.
- **No teleporting.** Each step moves along the polyline by distance = speed x elapsed time, capped at the leg end. A position is only ever a point on an authored leg or at a site.
- **Toward the booked WO.** The planner picks the route legs from the tech's current point to the next booked WO's functional location, so the trail and the WO list tell one story. Between bookings and after the last one, the tech cycles the assigned route loop.
- **Reconcile, do not step blindly.** Every run computes "where should this tech be at time T" from the day plan (deterministic, seeded by date + resource ID), then writes that. Re-running the same tick writes the same values. A missed tick is caught up on the next.

### 8.6 Daily work orders

**Batch creation** (first tick after 05:00 Detroit each day):
- Per resource, N WOs where N is drawn deterministically from `[woPerResourceMin, woPerResourceMax]`, **default 2 to 4**.
- Stable external ID: `GEV-DEMO-YYYYMMDD-NN` (NN = 01..99 across the day), stored in our own column `<prefix>_demoexternalid` on `msdyn_workorder` with an **alternate key**. Creation is an upsert on that key, so a re-run never duplicates. The stock WO number (`msdyn_name`) is left to the product's own numbering; the external ID also goes into the WO summary text for search.
- Types (prefix-owned incident types and work order types, created in our solution, not edits to stock records): **Pump Inspection** (Pump P-12, lift stations), **Substation Check** (North Substation, airport-area site), **Stormwater BMP Inspection** (Allendale, Holland, downtown). Each WO uses an existing WW-DEMO functional location and a customer asset at that location as primary incident asset, service account `WW Demo Municipal Utilities` or one of the fictional customers.
- Priority mix: about 10 percent high, the storm emergency WO on storm days.

**Lifecycle** (cited from [Work order lifecycle and system statuses](https://learn.microsoft.com/en-us/dynamics365/field-service/work-order-status-booking-status) and the [msdyn_workorder](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_workorder) and [bookingstatus](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/bookingstatus) references):

| Step | Agent writes | Product does | `msdyn_systemstatus` (WO) |
| --- | --- | --- | --- |
| Created | Upsert WO | Resource requirement created | Unscheduled `690970000` |
| Booked | Create `bookableresourcebooking` for the moving resource, linked to the requirement, start/end staggered across the day, booking status Scheduled | WO follows the booking | Scheduled `690970001` |
| Leave for job | Booking status **Traveling** (`msdyn_fieldservicestatus` `690970001`); set `starttime` explicitly (from the web/API, start time is not auto-updated, per the lifecycle doc) | Timestamp created | In Progress `690970002` |
| Arrive (check-in) | Booking status **In Progress** (`690970003`) when the tech's simulated position reaches the site | Sets Actual Arrival Time and WO First Arrived On | In Progress `690970002` |
| Finish (check-out) | Set `endtime` explicitly, then booking status **Completed** (`690970004`) (when someone else completes for the tech, end time is preserved, so we set it first) | Booking journals, WO completes when all bookings are done | Completed `690970003` |
| Cancel (default 5 percent, configurable) | Booking status **Canceled** (`690970005`), then set WO `msdyn_systemstatus` to Canceled `690970005` | Per the doc, a canceled booking alone returns the WO to Unscheduled, so the agent closes the WO explicitly | Canceled `690970005` |

Note: in `msdyn_bookingsystemstatus`, In Progress is `690970003` and On Break is `690970002` (not in label order). The agent looks up booking status records by `msdyn_fieldservicestatus`, never by name, and does not use On Break in v1.

Posted (`690970004`) is not used; it can trigger invoices and actuals. Every demo WO ends **Completed or Canceled** and stays. Nothing is deleted.

### 8.7 Daily shape and drive times

Day window 07:00 to 17:30 Detroit, per tech:

1. Leave HQ 07:00.
2. Job 1 to job N (2 to 4), each: travel leg, on-site duration by type (Pump Inspection 60 min, Substation Check 45 min, Stormwater BMP 40 min, emergency 90 min), small jitter.
3. **Return leg to HQ** after the last job. Last position of the day = HQ.

**Return leg, not an end-of-day WO.** A fake "return to office" work order would inflate WO counts, utilization and every analytics view in Section 10, and would need its own booking and incident type. A position-only leg keeps the WO history honest, still draws on the trail, and is logged as an activity row (`RETURN_TO_HQ`). Overnight, the tech stays at HQ (the "cycle routes 24/7" loop applies to a separate night-route set only if Pierre wants motion at night; default is HQ overnight with a slow yard loop off).

Speed model (simple, documented, configurable):

| Road class | Clear | Storm window |
| --- | --- | --- |
| Freeway (I-96, I-196, US-131, M-6) | 60 mph | 40 mph |
| Arterial (28th St, 44th St, M-37, Division) | 30 mph | 22 mph |
| Local / site access | 20 mph | 15 mph |
| Fixed overhead per leg (park, gate, walk) | 5 min | 8 min |

Example legs (approximate road miles, to be replaced by measured lengths of the authored polylines in Phase 3):

| Leg | Miles | Clear min | Storm min |
| --- | --- | --- | --- |
| HQ (Kentwood) to downtown GR via M-37/US-131 | 9 | 16 | 22 |
| Downtown GR to Market Ave SW site | 2 | 10 | 13 |
| Downtown GR to I-96/US-131 interchange | 3 | 8 | 11 |
| US-131 at M-6 (Wyoming) to downtown GR | 6 | 11 | 17 |
| M-6 full ring, I-196 Jenison to I-96 Cascade | 20 | 25 | 38 |
| Downtown GR to Allendale (GVSU) via I-196/M-45 | 13 | 22 | 30 |
| Downtown GR to Holland via I-196 | 28 | 33 | 50 |
| Downtown GR to Grand Haven via I-96/US-31 | 33 | 40 | 60 |
| HQ to airport-area site | 5 | 13 | 17 |
| Downtown GR to Rockford via US-131 | 13 | 18 | 26 |

Bookings are scheduled with these minutes as travel time, so the booking start times and the moving pins agree.

### 8.8 Check-in, check-out and logs

- **Check-in** = booking set to In Progress at the moment the simulated position reaches the site. **Check-out** = booking end time + Completed. At both moments the agent writes an activity row with the booking ID, WO external ID, resource, status, timestamp (UTC and Detroit), and the resource's latitude/longitude. The trail is queryable from Dataverse (activity table) and from Blob.
- **Position log**: every run, every tracked record, before and after positions: `{runId, tsUtc, target, recordId, before:{lat,lon}, after:{lat,lon}, routeId, legIndex, mode}`. Written to `agent-logs/positions/yyyy/mm/dd.jsonl` and to `<prefix>_demoposition` history if Pierre wants it in Dataverse.
- **Activity log**: WO and booking transitions plus `RETURN_TO_HQ` and `PAUSED` runs, to `agent-logs/activity/...` and to `<prefix>_demoactivity` (own table, own views).
- Booking timestamps and booking journals are created by the product on each status change, so stock FS history also exists ([booking timestamps](https://learn.microsoft.com/en-us/dynamics365/field-service/booking-timestamps)).

### 8.9 Config, cadence, kill switch

Config lives in our own table `<prefix>_demoagentconfig` (single row, prefix-owned, own form and view, no stock form edits) plus app settings as hard overrides:

| Setting | Default | Where |
| --- | --- | --- |
| `paused` | `false` (always on) | Dataverse config row (Pierre flips it from his phone during an MVP walkthrough) |
| `DEMO_AGENT_ENABLED` | `true` | Function app setting; `false` is a hard stop that does not need Dataverse |
| `DEMO_AGENT_MODE` | `dryrun` until Phase 8, then `live` | App setting |
| `moveCadenceMinutes` | 120 to 240 (Pierre's "every few hours") | Config row |
| `tickCron` | `0 */30 * * * *` (every 30 min, UTC) | App setting, referenced as `%DEMO_TICK_CRON%` |
| `woPerResourceMin` / `Max` | 2 / 4 | Config row |
| `cancelRatePercent` | 5 | Config row |
| `stormDay` | off; on for scripted storm days | Config row |

**Architecture note (flagged):** movement commits every 2 to 4 hours, but WO check-ins and check-outs land at specific minutes in the day. A 30-minute reconcile tick handles both: on each tick the agent applies every WO transition that is due, and moves positions only when the movement cadence says so or when a tech must arrive at a site for check-in. Pausing stops all writes; the next tick after unpause reconciles. While paused, each tick logs one `PAUSED` row and nothing else.

**Cost and limits for 24/7 (estimate):**
- Executions: 48 ticks per day plus 288 export runs (every 5 min) plus 1 MDOT list refresh, about 10,100 per month. Flex free grant is 250,000 executions per month per subscription.
- Compute: at 512 MB and an assumed 10 s per tick and 3 s per export, about 0.5 x (1,440 x 10 + 8,640 x 3) = about 20,000 GB-s per month. Free grant is 100,000 GB-s per month ([Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/)). Expected cost about $0, with headroom.
- Dataverse: a tick touches about 6 resources + a few assets + 1 to 3 WO transitions + logs, roughly 30 to 60 requests; about 3,000 per day. Service protection limits are 6,000 requests per user per 5-minute window per web server ([service protection API limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits)); we are far below. The agent still honors `Retry-After` on HTTP 429 and runs single-threaded. Daily request entitlement for the application user should be checked against the tenant's Power Platform request allocation in Phase 8.
- Data growth (kept forever, by decision): about 12 to 24 WOs per day = roughly 4,400 to 8,800 WOs per year, each with a requirement, a booking, booking timestamps and journals. Optional geolocation tracking rows at movement cadence: about 6 techs x 8 per day = about 17,500 rows per year. Small for Dataverse database capacity, but visible in capacity reports; Phase 10 views filter by date so the UI stays fast.

### 8.10 Stock-only build bar

- No edits to stock forms, views, option sets or booking status records. Option set values are never changed (Microsoft's own guidance in the lifecycle doc).
- All agent customizations (tables, columns, alternate keys, incident types, WO types, security role, views, dashboards) ship in one unmanaged prefix-owned solution `NukaSoftGevDemoAgent`, under the NukaSoft publisher (prefix **TBD, Pierre to confirm**).
- New columns on stock tables are limited to `<prefix>_demoexternalid` on `msdyn_workorder` (with its alternate key) and, only if chosen, nothing else.
- No Project Operations strings. Never touch Account latitude/longitude.

## 9. Brand handoff notes for Rita

Brand root on the builder box: `/workspace/nukasoft/brands/` (exists; `BRAND-OS.md`, `nukasoft/NUKASOFT-BRAND-CARD.md`). Rita is brand owner and logo approver; Pierre's go is required to publish.

- Palette from the brand card and already in `style-nukasoft-dynamics.css`: Nuka Red `#C41E24` (primary), Cream Ivory `#F5E6C8` (text, stars), Cola Brown `#3D1C0B` (outlines, map trails in motion work), Brass `#8B6914` (hairlines only), Aged Paper `#E8DCC8`, Radiation Yellow `#F1C40F` (hazard accent, sparingly; good for the storm alert). Forbidden: cyan, Microsoft/Fluent blue, SaaS gradients.
- Display font: Abril Fatface (local TTF in the DAM). Tin-sign aesthetic: four-point cream stars, distressed edges, swooshes.
- **No Microsoft, Entra or Dynamics product logos on tin-sign art.** The product name "God's Eye View, Dynamics" is text; Microsoft trademarks appear only as plain text in attribution.
- Copy: no em dashes. MDOT attribution and "Simulated demo positions" labels must stay legible on the red ground (check contrast on Cream Ivory text over Nuka Red, and on the pin colors in `visualForKind`).
- Asks for Rita: (1) tin-sign header for the share page and the HUD title bar, (2) a "Lake-effect Tuesday" title card for MVP talks, (3) pin glyph check (T, W, A, S, C, P) against the palette, (4) favicon and social preview image for `gev.<domain>`, (5) a storm-alert banner style.
- Upstream credit: keep "Fork of bilawalsidhu/gods-eye-view (MIT)" visible on the share page.

## 10. Future phase: analytics

The accumulated history (closed WOs, bookings, booking timestamps and journals, check-in/out activity rows, position history) becomes part of the MVP demo:

- **Our own views** on `msdyn_workorder` and `bookableresourcebooking` filtered to the demo team, e.g. "GEV Demo: Today", "GEV Demo: Closed last 30 days", "GEV Demo: Canceled for weather". New views in our solution; no stock view edits.
- **Our own model-driven dashboard** "GEV Demo Operations": WOs per day by type, first-time fix, average travel vs on-site minutes (from booking journals), cancellations on storm days.
- **Field Service built-in analytics and reports** read the same stock tables, so the history shows up there without customization.
- **Optional Power BI** over Dataverse or over the `exports-archive` snapshots for a "replay any day" map.
- GEV hook: a date picker that loads `exports-archive/<date>.geojson` to replay a past day on the globe.

## 11. Decisions for Pierre

### Decided

1. **Target env for the demo agent:** main NukaSoft demo tenant `nukasoft.crm.dynamics.com` (plan only; first write is a Phase 8 gate Pierre publishes).
2. **Bookable resources are the headline;** customer assets move second.
3. **24/7 loop, every few hours, always on;** pause is a manual override.
4. **Routes cycle repeatedly.**
5. **Daily WO batch, 2 to 4 per resource per day by default (configurable),** staggered, stock lifecycle, small fraction Canceled.
6. **Last leg of the day returns to HQ** (modeled as a return leg; see 8.7).
7. **Old demo WOs: "They get closed."** Never deleted or purged; every WO ends Completed or Canceled and stays.

### Open

1. **Azure subscription and tenant:** confirm the subscription ID and tenant ID under The Technical Seller account (kept out of the repo), the monthly budget alert amount, and the `cost-center` tag value.
2. **Subdomain:** `gev.thetechnicalseller.com` (DNS at Wix) or `gev.nukasoft.ai` (DNS at GoDaddy), or both. Who holds each DNS login.
3. **SWA plan:** start on Free (recommended) or go Standard now for SLA.
4. **Map tile keys for the public site:** which provider (Google Photorealistic 3D via direct key, Cesium ion) and the spend cap; keys must be referrer-restricted to the subdomain.
5. **Which upstream layers stay on in the public build:** the 26 Vite dev-server `/api` routes do not exist on SWA. Recommended MVP set: globe, FS layer, MDOT cameras, weather visuals. Everything else hidden or ported later.
6. **MDOT camera stills:** link-out to MiDrive only (recommended to start) or proxied stills, given `robots.txt` Disallow and no published reuse terms found. Optionally ask MDOT.
7. **Simulated plows:** show a labeled "Simulated MDOT plow route" layer or no plows until a public AVL feed exists.
8. **Position targets:** own table only (default), plus `msdyn_geolocationtracking` for schedule board motion (needs User-type demo techs, which conflicts with the no-test-users practice), plus `msdyn_customerasset` latitude/longitude for mobile assets.
9. **Cross-tenant identity:** if The Technical Seller Azure tenant is not the NukaSoft tenant, approve the app registration model (certificate in Key Vault, app registered in the NukaSoft tenant). Pierre creates the app registration and application user.
10. **Publisher prefix** for the `NukaSoftGevDemoAgent` solution.
11. **Demo business unit / owner team:** approve creating a "NukaSoft Demo" team or BU that owns all agent records, which is what scopes the role and the public export.
12. **Night motion:** techs parked at HQ overnight (default) or a night route loop so the globe moves at any hour.
13. **Log retention in Blob:** delete `agent-logs` and `exports-archive` blobs after N days (proposal 365), or keep forever in Cold.
14. **Site access:** fully public, or SWA built-in auth (invite list, 25 users on Free) for the first weeks.
15. **Storm days:** scripted on demand for talks only, or a recurring "storm Tuesday" in the live loop.
