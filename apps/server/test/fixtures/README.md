# Recorded RTCM3 fixture

`1CEN.rtcm3` holds 120 s of raw bytes from mountpoint `1CEN` (Charnoz-sur-Ain,
France; u-blox ZED-F9P running RTKBase) on the Centipede caster
`caster.centipede.fr:2101`. Centipede publishes the guest login
`centipede` / `centipede`. The recording was made on 2026-10-29 at 07:02 UTC
with `ntripFeed` from `apps/server/src/cors/ntrip.ts`.

The stream carries 1005, 1008, 1033, MSM7 for GPS, GLONASS, Galileo and
BeiDou (1077/1087/1097/1127), ephemerides 1019/1020/1042/1046, and 1230.

`1CEN.expected.json` is the independent reference used by
`src/cors/real-stream.test.ts`. It comes from pyrtcm (decoding) and cssrlib
(`eph2pos` satellite position and clock 600 s after toe). Neither library
shares code with this repository. To regenerate it:

```sh
uv venv /tmp/rtcm-ref && VIRTUAL_ENV=/tmp/rtcm-ref uv pip install pyrtcm cssrlib numpy
/tmp/rtcm-ref/bin/python make-expected.py 1CEN.rtcm3 1793257458 > 1CEN.expected.json
```

The second argument is the recording time in Unix seconds. It resolves the
truncated week numbers.
