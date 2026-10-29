"""Independent reference for a recorded RTCM3 stream.

Decodes the stream with pyrtcm and computes satellite positions with
cssrlib `eph2pos`, so the TypeScript decoder and orbit code are checked
against two implementations they share no code with.

    python make-expected.py <stream.rtcm3> <recorded-at-unix-seconds> > <stream>.expected.json
"""
import json
import sys

import numpy as np
from cssrlib.ephemeris import eph2pos
from cssrlib.gnss import Eph, gtime_t, prn2sat, uGNSS
from pyrtcm import RTCMReader

SC = 3.1415926535898
RANGE_MS = 299792.458
GPS0 = 315964800
LEAP = 18
WEEK = 604800
EPH = {
    "1019": ("G", uGNSS.GPS, "DF009", 1024, 0, 0),
    "1046": ("E", uGNSS.GAL, "DF252", 4096, 1024, 0),
    "1042": ("C", uGNSS.BDS, "DF488", 8192, 1356, 14),
}
# pyrtcm field ids per system: week, iode, toc, af2, af1, af0, crs, deln, M0, cuc, e, cus, sqrtA, toes,
# cic, OMG0, cis, i0, crc, omg, OMGd, idot, tgd, health
F = {
    "G": "DF076 DF071 DF081 DF082 DF083 DF084 DF086 DF087 DF088 DF089 DF090 DF091 DF092 DF093 DF094 DF095 DF096 DF097 DF098 DF099 DF100 DF079 DF101 DF102",
    "E": "DF289 DF290 DF293 DF294 DF295 DF296 DF297 DF298 DF299 DF300 DF301 DF302 DF303 DF304 DF305 DF306 DF307 DF308 DF309 DF310 DF311 DF292 DF313 DF287",
    "C": "DF489 DF492 DF493 DF494 DF495 DF496 DF498 DF499 DF500 DF501 DF502 DF503 DF504 DF505 DF506 DF507 DF508 DF509 DF510 DF511 DF512 DF491 DF513 DF515",
}
NAMES = "week iode toc af2 af1 af0 crs deln M0 cuc e cus sqrtA toes cic OMG0 cis i0 crc omg OMGd idot tgd svh".split()
ANGLES = {"deln", "M0", "OMG0", "i0", "omg", "OMGd", "idot"}
MSM = {"107": ("G", "DF004", 0), "109": ("E", "DF248", 0), "112": ("C", "DF427", 14)}


def gtime(gps):
    t = gtime_t()
    t.time = int(np.floor(gps)) + GPS0
    t.sec = gps - np.floor(gps)
    return t


def main(path, recorded_unix):
    ref_gps = recorded_unix - GPS0 + LEAP
    station, ephs, epochs = None, {}, []
    for _, m in RTCMReader(open(path, "rb")):
        i = m.identity
        if i in ("1005", "1006") and station is None:
            station = {"msgType": int(i), "stationId": m.DF003, "x": m.DF025, "y": m.DF026, "z": m.DF027,
                       "antennaHeightM": getattr(m, "DF028", None)}
        elif i in EPH:
            sys_, usys, prn_f, mod, off, toff = EPH[i]
            v = {n: getattr(m, f) for n, f in zip(NAMES, F[sys_].split())}
            for n in ANGLES:
                v[n] *= SC
            ref_week = int((ref_gps - toff) // WEEK)
            base = v["week"] + off
            week = base + round((ref_week - base) / mod) * mod
            toe = week * WEEK + v["toes"] + toff
            prn = getattr(m, prn_f)
            eph = Eph()
            eph.sat = prn2sat(usys, prn)
            eph.A = v["sqrtA"] ** 2
            eph.e, eph.i0, eph.OMG0, eph.omg, eph.M0 = v["e"], v["i0"], v["OMG0"], v["omg"], v["M0"]
            eph.deln, eph.idot, eph.OMGd = v["deln"], v["idot"], v["OMGd"]
            eph.cuc, eph.cus, eph.crc, eph.crs, eph.cic, eph.cis = (v[k] for k in ("cuc", "cus", "crc", "crs", "cic", "cis"))
            eph.af0, eph.af1, eph.af2 = v["af0"], v["af1"], v["af2"]
            eph.toes = v["toes"]
            eph.toe = gtime(toe)
            eph.toc = gtime(week * WEEK + v["toc"] + toff)
            t = toe + 600
            rs, dts = eph2pos(gtime(t), eph)
            ephs[f"{sys_}{prn}"] = {"sys": sys_, "prn": prn, "toe": toe, "iode": v["iode"],
                                   "sqrtA": v["sqrtA"], "e": v["e"], "m0": v["M0"], "af0": v["af0"],
                                   "t": t, "pos": [float(x) for x in rs], "dts": float(dts)}
        elif i[:3] in MSM and i[3] in "4567" and len(epochs) < 12:
            sys_, tow_f, toff = MSM[i[:3]]
            ext = i[3] in "67"
            prns = [int(getattr(m, f"PRN_{k:02d}")) for k in range(1, m.NSat + 1)]
            cells = []
            for c in range(1, m.NCell + 1):
                prn = int(getattr(m, f"CELLPRN_{c:02d}"))
                k = prns.index(prn) + 1
                rough, frac = getattr(m, f"DF397_{k:02d}"), getattr(m, f"DF398_{k:02d}")
                fine = getattr(m, f"DF405_{c:02d}" if ext else f"DF400_{c:02d}")
                ok = rough != 255 and fine is not None and abs(fine) < 2 ** -10
                cells.append({"prn": prn, "sig": getattr(m, f"CELLSIG_{c:02d}"),
                              "prM": (rough + frac + fine) * RANGE_MS if ok else None})
            epochs.append({"msgType": int(i), "sys": sys_, "towMs": getattr(m, tow_f), "cells": cells})
    json.dump({"recordedGps": ref_gps, "station": station, "ephemerides": list(ephs.values()), "msm": epochs},
              sys.stdout, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]))
