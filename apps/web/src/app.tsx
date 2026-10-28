import { HomeScreen } from './features/home/home-screen';
import { RoomScreen } from './features/room/room-screen';
import { useLocationTracking } from './location/use-location-tracking';
import { useRoomStore } from './sync/room-store';

export function App() {
  const phase = useRoomStore((s) => s.phase);
  const role = useRoomStore((s) => s.role);
  useLocationTracking(phase === 'in-room' && role === 'device');
  return phase === 'in-room' ? <RoomScreen /> : <HomeScreen />;
}
