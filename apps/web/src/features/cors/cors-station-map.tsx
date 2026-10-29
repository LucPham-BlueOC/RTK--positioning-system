import type { CorsStation } from '@rtk/shared';
import { useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { fmtCoord, fmtM } from '../../lib/format';
import { Button, Card, Stat } from '../ui';

const MSG_LABEL: Record<CorsStation['msgType'], string> = {
  1005: '1005',
  1006: '1006',
  1032: '1032 (trạm vật lý)',
};

export function CorsStationMap({ station }: { station: CorsStation | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!station) {
    return (
      <Card title="Vị trí trạm">
        <p className="text-sm text-slate-400">Chưa nhận được vị trí anten (1005/1006/1032).</p>
      </Card>
    );
  }
  const copy = () => {
    void navigator.clipboard
      ?.writeText(`${station.lat.toFixed(8)}, ${station.lon.toFixed(8)}`)
      .then(() => setCopied(true));
  };

  return (
    <Card title="Vị trí trạm">
      <MapContainer
        center={[station.lat, station.lon]}
        zoom={16}
        maxZoom={19}
        className="h-64 rounded-xl"
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <CircleMarker
          center={[station.lat, station.lon]}
          radius={9}
          pathOptions={{ color: '#0f172a', weight: 2, fillColor: '#f472b6', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            Trạm {station.stationId}
          </Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Vĩ độ" value={fmtCoord(station.lat)} />
        <Stat label="Kinh độ" value={fmtCoord(station.lon)} />
        <Stat label="Độ cao (WGS84)" value={fmtM(station.alt)} />
        <Stat label="Chiều cao anten" value={fmtM(station.antennaHeightM)} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-400">Mã vị trí</dt>
        <dd>{MSG_LABEL[station.msgType]}</dd>
        <dt className="text-slate-400">Anten</dt>
        <dd>{station.antenna || '—'}</dd>
        <dt className="text-slate-400">Máy thu</dt>
        <dd>
          {station.receiver || '—'}
          {station.firmware ? ` (${station.firmware})` : ''}
        </dd>
        <dt className="text-slate-400">ECEF</dt>
        <dd className="tabular font-mono text-xs">
          {station.ecef.x.toFixed(4)}, {station.ecef.y.toFixed(4)}, {station.ecef.z.toFixed(4)}
        </dd>
      </dl>
      <Button variant="secondary" className="mt-3" onClick={copy}>
        {copied ? 'Đã copy tọa độ' : 'Copy tọa độ'}
      </Button>
    </Card>
  );
}
