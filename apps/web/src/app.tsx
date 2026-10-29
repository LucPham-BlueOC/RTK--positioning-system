import { CorsPage } from './features/cors/cors-page';
import { HomeScreen } from './features/home/home-screen';
import { RoomScreen } from './features/room/room-screen';
import { useLocationTracking } from './location/use-location-tracking';
import { useRoomStore } from './sync/room-store';

export function App() {
  const phase = useRoomStore((s) => s.phase);
  const role = useRoomStore((s) => s.role);
  const corsView = useRoomStore((s) => s.corsView);
  useLocationTracking(phase === 'in-room' && role === 'device' && !corsView);
  if (corsView) return <CorsPage />;
  return phase === 'in-room' ? <RoomScreen /> : <HomeScreen />;
}
