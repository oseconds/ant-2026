# Exhibition prototype operation

This research branch provides a technical candidate. The current visual comparisons were judged too similar by the artist; they do not yet satisfy the intended long-run change in macro form. The 1,024-Plate storage experiment is authorized as a **shadow only**, and is not an adopted startup setting. Do not advertise this branch as a finished exhibition release.

The last integrated headed rehearsal was stopped at the user's request after **18:00.296**, at **30→112 historical Plates / two acoustic residents**. It ended cleanly with status `interrupted`; it did **not** complete the requested two hours. Primary submission decision is **E: not ready**. The commands below document the prototype and future reproduction, not an approved continuation of research or a proven two-hour operating recipe.

## Startup choices

Build and serve this branch with Node 20 or later:

```powershell
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/` for the unchanged default Full audio model and current renderer. Audio starts Off; enabling it still selects Full unless the startup query chooses another audio path. Mature Full and existing `?antAudio=lite` are below realtime on the measured machine.

Open `http://127.0.0.1:4173/?antResidents=2&antVisual=recent` for the research candidate. Confirm both visible prototype labels, select ANT if needed, then click its Audio control once to enable live audio. One resident is available as `antResidents=1`, but the selected integrated experiment uses two. `antResidents` takes precedence over `antAudio=lite`; resident mode retains internal Z physics. Query choices are read at page startup. Reloading creates a new world; do not reload or toggle models during a continuity run.

The amber material image identifies cells whose **actual exposed top** belongs to one of the latest eight birth-order Plates. Older material retains the original gray history image. It does not animate with age or alter depth, history, formation or movement. The source material history remains present, including acoustically retired Plates.

The audio cohort contains the newest two material Plates. Contacts on other true top surfaces produce no Plate strike in this mode. Full-world contact normalization is retained. The same Plate solver, damping, 3 ms pulse and 75 ms recovery are used for residents. Z links crossing the cohort boundary, nonresident pickups/vibration and foundation Spheres attached to retired material are omitted. All tested mature cohorts had **zero live Spheres** despite 32 historical Nodules. Retirement is abrupt, with existing worklet interpolation only; no inaudible-transition guarantee is made.

## Browser scheduling condition

The native scheduling attempt slowed its renderer toward 1 Hz even while AudioContext time advanced normally. Its cause was not isolated. The protected launch used for the final long-run measurement retains these Chrome flags:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  --user-data-dir="$env:LOCALAPPDATA\ANT-Exhibition-Review" `
  --disable-background-timer-throttling `
  --disable-backgrounding-occluded-windows `
  --disable-renderer-backgrounding `
  'http://127.0.0.1:4173/?antResidents=2&antVisual=recent'
```

Use a separate Chrome profile so an existing browser process does not silently absorb the launch and ignore the flags. This example is an operator launch, not proof that every browser, screen saver, display sleep condition or venue machine will behave identically. The automated evidence additionally uses Playwright's normal automation arguments, recorded in each `run.json`. Its viewport is 1440 × 1100 with a 640 × 640 ANT canvas and DPR 1. The artist's final display size, scaling, audio device and simultaneous software require their own rehearsal.

Keep the ANT tab/display active, prevent OS sleep through the venue's normal approved setup, and watch simulation time as well as sound. A smooth sound clock can coexist with a slow world. Physical DAC output, loudspeaker level and human listening are outside the telemetry proof. Review the [fixed-gain listening page](audio/listening.html) before any public playback decision.

## Storage and fallback limits

The normal startup query above still has the **production 256-Plate history cap**. In the measured seed it stopped further material births at 63:34.783 simulated time. Ants and pheromone continue; the persistent material top/depth then stays fixed. The amber image cannot create genuine turnover once births stop. Do not confuse the 1,024 shadow's continued turnover with what the ordinary query does.

The ordinary page also uses the existing production RNG source. The deterministic seed `20261005` is injected only by the research harness; the query does not promise that seed or its exact geometry. A two-Plate limit bounds the number of sounding bodies, not their geometry-dependent node count or a universal CPU deadline. Report the maximum actually measured solver-node count and rehearse the actual exhibition world; the 32×32 solver grid could in principle contain 1,024 nodes per Plate, more than these natural captures.

The conservative operational fallback is **Audio Off with the current or opt-in recent renderer**. This removes audio-thread pressure but does not solve the artist's long-run macro-form concern. If either sound or world clocks lose progression, stop the rehearsal and keep its records; this prototype does not silently reset, swap physics or discard history to recover.

## Reproduce the approved storage shadow

The only path that raises storage is the research harness. It changes the two instance capacities and allows the bridge to retain the extra immutable descriptors before measured continuous execution; it never changes qualification constants or evicts old material. Its explicit screen label says `SHADOW history capacity 1024`.

```powershell
$env:ANT_SOAK_SECONDS='7200'
$env:ANT_SOAK_SAMPLE_SECONDS='30'
$env:ANT_SOAK_TARGET_PLATES='30'
$env:ANT_SOAK_PREGROW='natural'
$env:ANT_SOAK_AUDIO='on'
$env:ANT_SOAK_QUERY='?antResidents=2&antVisual=recent'
$env:ANT_SOAK_HISTORY_CAPACITY='1024'
$env:ANT_SOAK_SCHEDULING='no-background-throttling'
node scripts/ant-exhibition-soak.js
```

Pre-growth is accelerated natural Audio-Off simulation to the requested Plate count. The measured soak then advances in real wall time with continuous Audio On and the normal renderer. These durations are reported separately. New evidence goes to a timestamped directory. To end a rehearsal gracefully, write the reason into its `STOP` file; the harness records an interrupted status and final checkpoint. Do not count an interrupted run as completion of its requested duration.

Final duration, maximum history count, memory and clock results belong in [REPORT.md](REPORT.md) and the recorded telemetry, not in this operating recipe. The 1,024 cap also remains finite; no unbounded lifetime claim follows from a two-hour experiment.
