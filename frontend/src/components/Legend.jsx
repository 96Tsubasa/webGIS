import React from 'react';
import { VARIABLE_CONFIG } from '../utils';

function Legend({ currentVariable }) {
  const layerName = VARIABLE_CONFIG[currentVariable].layer;
  
  const legendSrc = `http://localhost:8080/geoserver/wms?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=20&HEIGHT=20&LAYER=${layerName}`;

  return (
    <div id="legend-container">
      <img id="legend-image" src={legendSrc} alt="Legend" style={{ display: 'block' }} />
    </div>
  );
}

export default Legend;
