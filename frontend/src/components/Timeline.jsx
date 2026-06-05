import React, { useEffect, useRef } from 'react';
import { formatTimestamp, parseTimestampToDate } from '../utils';

function Timeline({ timestamps, currentIndex, onChangeIndex, isPlaying, onPlayToggle }) {
  const visualRef = useRef(null);
  
  // Handling Playback
  useEffect(() => {
    let interval = null;
    if (isPlaying && timestamps.length > 0) {
      interval = setInterval(() => {
        onChangeIndex(prev => (prev + 1 >= timestamps.length ? 0 : prev + 1));
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, timestamps.length, onChangeIndex]);

  // Handle Dragging
  useEffect(() => {
    const visual = visualRef.current;
    if (!visual || timestamps.length === 0) return;

    let dragging = false;
    const track = visual.querySelector('.slider-track') || visual;

    function posToIndex(clientX) {
      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = x / rect.width;
      return Math.round(pct * (timestamps.length - 1));
    }

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      document.body.style.userSelect = 'none';
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      onChangeIndex(posToIndex(clientX));
    }

    function onMove(e) {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      onChangeIndex(posToIndex(clientX));
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
    }

    visual.addEventListener('mousedown', onDown);
    visual.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    return () => {
      visual.removeEventListener('mousedown', onDown);
      visual.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [timestamps, onChangeIndex]);

  const max = Math.max(1, timestamps.length - 1);
  const pct = (currentIndex / max) * 100 || 0;
  
  const currentTs = timestamps[currentIndex]?.timestamp;
  const labelText = currentTs ? formatTimestamp(currentTs) : "Chưa có dữ liệu";

  // Calculate ticks
  const ticks = [];
  if (timestamps.length > 0) {
    const first = parseTimestampToDate(timestamps[0].timestamp);
    const last = parseTimestampToDate(timestamps[timestamps.length - 1].timestamp);
    const firstMs = first.getTime();
    const lastMs = last.getTime();
    
    if (lastMs > firstMs) {
      let dMs = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
      const endMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
      
      while (dMs <= endMs) {
        let p = ((dMs - firstMs) / (lastMs - firstMs)) * 100;
        p = Math.max(0, Math.min(100, p));
        const d = new Date(dMs);
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = d.getUTCFullYear();
        
        let isActive = false;
        if (currentTs) {
          const curDate = parseTimestampToDate(currentTs);
          if (curDate && curDate.getUTCDate() === d.getUTCDate() && curDate.getUTCMonth() === d.getUTCMonth()) {
            isActive = true;
          }
        }
        
        ticks.push({ pct: p, label: `${dd}-${mm}-${yyyy}`, active: isActive });
        dMs += 24 * 60 * 60 * 1000;
      }
    }
  }

  return (
    <div id="timeline-container">
      <button id="play-btn" aria-label="Play/Pause" onClick={onPlayToggle}>
        {!isPlaying ? (
          <svg id="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 3v18l15-9L5 3z" fill="#222"/>
          </svg>
        ) : (
          <svg id="pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="#222"/>
          </svg>
        )}
      </button>

      <input 
        className="visually-hidden" 
        type="range" 
        id="time-slider" 
        min="0" 
        max={max} 
        value={currentIndex} 
        readOnly 
      />

      <div id="slider-visual" ref={visualRef}>
        <div className="slider-track">
          <div id="slider-ticks" className="slider-ticks">
            {ticks.map((t, i) => (
              <div key={i} className={`tick ${t.active ? 'active' : ''}`} style={{ left: `${t.pct}%` }}>
                {t.label}
              </div>
            ))}
          </div>
          <div id="slider-progress" className="slider-progress" style={{ width: `${pct}%` }}></div>
          <div id="slider-handle" className="slider-handle" style={{ left: `${pct}%` }}>
            <div id="slider-time-label" className="time-label">{labelText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
