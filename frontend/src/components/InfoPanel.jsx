import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { formatTimestamp, queryLayer, reverseGeocode, directionText } from '../utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function InfoPanel({ selectedPoint, currentTimestamp, timestamps, onClose }) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState({
    locationName: '-',
    timeText: '-',
    temperature: '-',
    precipitation: '-',
    windSpeed: '-',
    direction: '-'
  });
  const [chartData, setChartData] = useState({ labels: [], temp: [], rain: [] });
  const [chartLoading, setChartLoading] = useState(true);

  // Fetch Point Info
  useEffect(() => {
    let active = true;
    
    async function fetchInfo() {
      if (!selectedPoint || !currentTimestamp) return;
      setLoading(true);

      try {
        const [tempText, precipText, windUText, windVText, locationName] = await Promise.all([
          queryLayer('weather:temperature', selectedPoint, currentTimestamp),
          queryLayer('weather:precipitation', selectedPoint, currentTimestamp),
          queryLayer('weather:wind_u', selectedPoint, currentTimestamp),
          queryLayer('weather:wind_v', selectedPoint, currentTimestamp),
          reverseGeocode(selectedPoint),
        ]);

        if (!active) return;

        const tempMatch = tempText.match(/GRAY_INDEX = ([\d.-]+)/);
        const precipMatch = precipText.match(/GRAY_INDEX = ([\d.-]+)/);
        const temperature = tempMatch ? parseFloat(tempMatch[1]).toFixed(2) : 'No data';
        const precipitation = precipMatch ? parseFloat(precipMatch[1]).toFixed(2) : 'No data';

        const windUMatch = windUText.match(/GRAY_INDEX = ([\d.-]+)/);
        const windVMatch = windVText.match(/GRAY_INDEX = ([\d.-]+)/);
        const u = windUMatch ? parseFloat(windUMatch[1]) : 0;
        const v = windVMatch ? parseFloat(windVMatch[1]) : 0;
        const windSpeed = Math.sqrt(u * u + v * v);
        const angle = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;

        setInfo({
          locationName,
          timeText: formatTimestamp(currentTimestamp),
          temperature: `${temperature} °C`,
          precipitation: `${precipitation} mm`,
          windSpeed: `${windSpeed.toFixed(2)} m/s`,
          direction: directionText(angle),
        });
      } catch (err) {
        console.error('Info fetch failed:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchInfo();

    return () => { active = false; };
  }, [selectedPoint, currentTimestamp]);

  // Fetch Chart Data
  useEffect(() => {
    let active = true;

    async function fetchCharts() {
      if (!selectedPoint || timestamps.length === 0) return;
      setChartLoading(true);

      try {
        const series = await Promise.all(
          timestamps.map(async ({ timestamp }) => {
            const [temp, rain] = await Promise.all([
              queryLayer('weather:temperature', selectedPoint, timestamp),
              queryLayer('weather:precipitation', selectedPoint, timestamp),
            ]);

            return {
              timestamp,
              temp: parseFloat(temp.match(/GRAY_INDEX = ([\d.-]+)/)?.[1]),
              rain: parseFloat(rain.match(/GRAY_INDEX = ([\d.-]+)/)?.[1]),
            };
          })
        );

        if (!active) return;

        setChartData({
          labels: series.map((x) => formatTimestamp(x.timestamp)),
          temp: series.map((x) => x.temp),
          rain: series.map((x) => x.rain),
        });
      } catch (err) {
        console.error('Chart fetch failed:', err);
      } finally {
        if (active) setChartLoading(false);
      }
    }

    fetchCharts();

    return () => { active = false; };
  }, [selectedPoint, timestamps]);

  const tempChartConfig = {
    labels: chartData.labels,
    datasets: [
      {
        label: '°C',
        data: chartData.temp,
        borderColor: '#e74c3c',
        tension: 0.35,
      },
    ],
  };

  const rainChartConfig = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'mm',
        data: chartData.rain,
        backgroundColor: '#3498db',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
  };

  return (
    <div id="info-panel" style={{ display: 'block' }}>
      <div className="panel-header">
        <div className="header-text">
          <div id="location-text">{loading ? 'Đang tải...' : info.locationName}</div>
          <div id="time-text">{loading ? 'Đang tải...' : info.timeText}</div>
        </div>
        <div className="header-actions">
          <button id="close-info" aria-label="Close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="panel-body">
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-icon">🌡️</div>
            <div>
              <div className="stat-label">Nhiệt độ</div>
              <div id="temperature-text" className="stat-value">{loading ? '...' : info.temperature}</div>
            </div>
          </div>

          <div className="stat">
            <div className="stat-icon">🌧️</div>
            <div>
              <div className="stat-label">Lượng mưa</div>
              <div id="precipitation-text" className="stat-value">{loading ? '...' : info.precipitation}</div>
            </div>
          </div>

          <div className="stat">
            <div className="stat-icon">💨</div>
            <div>
              <div className="stat-label">Gió</div>
              <div id="wind-text" className="stat-value">{loading ? '...' : info.windSpeed}</div>
            </div>
          </div>

          <div className="stat">
            <div className="stat-icon">🧭</div>
            <div>
              <div className="stat-label">Hướng</div>
              <div id="direction-text" className="stat-value">{loading ? '...' : info.direction}</div>
            </div>
          </div>
        </div>

        <div className="forecast-section">
          <div className="forecast-title">Dự báo nhiệt độ</div>
          <div className="chart-card" style={{ height: '140px' }}>
            <Line data={tempChartConfig} options={chartOptions} />
            {chartLoading && (
              <div className="chart-loading">
                <div className="spinner"></div>
              </div>
            )}
          </div>

          <div className="forecast-title">Dự báo lượng mưa</div>
          <div className="chart-card" style={{ height: '140px' }}>
            <Bar data={rainChartConfig} options={chartOptions} />
            {chartLoading && (
              <div className="chart-loading">
                <div className="spinner"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoPanel;
