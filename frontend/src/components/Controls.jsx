import React from 'react';

function Controls({ currentVariable, onVariableChange, windOn, onWindToggle }) {
  return (
    <>
      <select 
        id="weather-variable" 
        value={currentVariable} 
        onChange={(e) => onVariableChange(e.target.value)}
      >
        <option value="temperature">Nhiệt độ</option>
        <option value="precipitation">Lượng mưa</option>
      </select>

      <div id="wind-toggle">
        <label>
          <input 
            type="checkbox" 
            id="wind-toggle-input" 
            checked={windOn} 
            onChange={(e) => onWindToggle(e.target.checked)} 
          /> Gió
        </label>
      </div>
    </>
  );
}

export default Controls;
