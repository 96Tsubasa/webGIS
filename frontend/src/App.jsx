import { useState, useEffect } from 'react';
import MapComponent from './components/Map';
import Timeline from './components/Timeline';
import InfoPanel from './components/InfoPanel';
import Controls from './components/Controls';
import Legend from './components/Legend';
import './index.css';
import 'leaflet/dist/leaflet.css';

function App() {
  const [timestamps, setTimestamps] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentVariable, setCurrentVariable] = useState('temperature');
  const [windOn, setWindOn] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    async function loadTimestamps() {
      try {
        const res = await fetch(`http://localhost:3000/api/timestamps?variable=${currentVariable}`);
        const data = await res.json();
        setTimestamps(data);

        if (data.length > 0) {
          const now = new Date();
          let nearestIndex = 0;
          let smallestDiff = Infinity;

          data.forEach((t, index) => {
            const ts = t.timestamp;
            const date = new Date(
              `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`,
            );
            const diff = Math.abs(date - now);

            if (diff < smallestDiff) {
              smallestDiff = diff;
              nearestIndex = index;
            }
          });

          setCurrentIndex(nearestIndex);
        } else {
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error('Failed to load timestamps:', err);
      }
    }

    loadTimestamps();
  }, [currentVariable]);

  // Set default selected point (Hanoi) on initial mount
  useEffect(() => {
    setSelectedPoint({ lat: 21.0285, lng: 105.8542 });
  }, []);

  return (
    <>
      <MapComponent
        timestamps={timestamps}
        currentIndex={currentIndex}
        currentVariable={currentVariable}
        windOn={windOn}
        selectedPoint={selectedPoint}
        onPointSelect={setSelectedPoint}
      />

      {selectedPoint && (
        <InfoPanel
          selectedPoint={selectedPoint}
          currentTimestamp={timestamps[currentIndex]?.timestamp}
          timestamps={timestamps}
          onClose={() => setSelectedPoint(null)}
        />
      )}

      <Legend currentVariable={currentVariable} />

      <Controls
        currentVariable={currentVariable}
        onVariableChange={setCurrentVariable}
        windOn={windOn}
        onWindToggle={setWindOn}
      />

      <Timeline
        timestamps={timestamps}
        currentIndex={currentIndex}
        onChangeIndex={setCurrentIndex}
        isPlaying={isPlaying}
        onPlayToggle={() => setIsPlaying(!isPlaying)}
      />
    </>
  );
}

export default App;
