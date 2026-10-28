import type { Sample } from '@rtk/shared';
import { latLngBounds } from 'leaflet';
import { useEffect, useRef } from 'react';
import {
  Circle,
  CircleMarker,
  LayersControl,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { DEVICE_COLORS } from '../ui';

/** Point cloud cap per device, to keep the map responsive. */
const MAX_CLOUD = 400;

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length < 2) return;
    map.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 21 });
    done.current = true;
  }, [map, points]);
  return null;
}

export function PositionMap({
  clouds,
  names,
}: {
  clouds: [Sample[], Sample[]];
  names: [string, string];
}) {
  const latest = clouds.map((c) => c.at(-1));
  const anchor = latest[0] ?? latest[1];
  if (!anchor) {
    return (
      <div className="grid h-80 place-items-center rounded-2xl bg-slate-900 text-slate-400">
        Chưa có vị trí.
      </div>
    );
  }
  const fitPoints = latest
    .filter((s): s is Sample => !!s)
    .map((s) => [s.lat, s.lon] as [number, number]);

  return (
    <MapContainer
      center={[anchor.lat, anchor.lon]}
      zoom={19}
      maxZoom={22}
      className="h-80 rounded-2xl"
      attributionControl
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Bản đồ">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            maxNativeZoom={19}
            maxZoom={22}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Vệ tinh">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri World Imagery"
            maxNativeZoom={19}
            maxZoom={22}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <FitOnce points={fitPoints} />
      {clouds.map((cloud, i) =>
        cloud
          .slice(-MAX_CLOUD)
          .map((s) => (
            <CircleMarker
              key={`${i}-${s.seq}`}
              center={[s.lat, s.lon]}
              radius={2}
              pathOptions={{ color: DEVICE_COLORS[i], weight: 0, fillOpacity: 0.45 }}
            />
          )),
      )}
      {latest.map(
        (s, i) =>
          s && (
            <Circle
              key={`acc-${i}`}
              center={[s.lat, s.lon]}
              radius={s.accuracy}
              pathOptions={{ color: DEVICE_COLORS[i], weight: 1, fillOpacity: 0.08 }}
            />
          ),
      )}
      {latest.map(
        (s, i) =>
          s && (
            <CircleMarker
              key={`pos-${i}`}
              center={[s.lat, s.lon]}
              radius={8}
              pathOptions={{
                color: '#0f172a',
                weight: 2,
                fillColor: DEVICE_COLORS[i],
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {names[i]}
              </Tooltip>
            </CircleMarker>
          ),
      )}
    </MapContainer>
  );
}
