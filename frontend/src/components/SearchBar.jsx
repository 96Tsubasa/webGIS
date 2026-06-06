import React, { useState, useEffect } from 'react';

function SearchBar({ onLocationSelect }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query
          )}&countrycodes=vn&accept-language=vi&limit=5`
        );
        const data = await response.json();
        setSuggestions(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Lỗi khi tìm kiếm địa điểm:', err);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (item) => {
    const latlng = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
    onLocationSelect(latlng);
    setQuery(item.display_name);
    setIsOpen(false);
  };

  return (
    <div id="search-container">
      <input
        id="search-input"
        type="text"
        autoComplete="off"
        placeholder="Tìm kiếm địa điểm tại Việt Nam..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onBlur={() => {
          // Tránh đóng dropdown trước khi click kịp chạy
          setTimeout(() => setIsOpen(false), 200);
        }}
      />
      {loading && <div className="search-spinner"></div>}

      {isOpen && suggestions.length > 0 && (
        <ul className="search-suggestions">
          {suggestions.map((item) => (
            <li
              key={item.place_id}
              className="suggestion-item"
              onClick={() => handleSelect(item)}
            >
              {item.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchBar;
