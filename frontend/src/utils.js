export const VARIABLE_CONFIG = {
  temperature: {
    layer: 'weather:temperature',
    opacity: 0.55,
  },
  precipitation: {
    layer: 'weather:precipitation',
    opacity: 0.72,
  },
};

export function getIsoTime(timestamp) {
  if (!timestamp) return '';
  return (
    `${timestamp.slice(0, 4)}-` +
    `${timestamp.slice(4, 6)}-` +
    `${timestamp.slice(6, 8)}T` +
    `${timestamp.slice(9, 11)}:` +
    `${timestamp.slice(11, 13)}:` +
    `${timestamp.slice(13, 15)}.000Z`
  );
}

export function formatTimestamp(ts) {
  if (!ts) return '';
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const hour = ts.slice(9, 11);
  return `${hour}:00 ${day}/${month}/${year}`;
}

export function parseTimestampToDate(ts) {
  if (!ts) return null;
  return new Date(
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`
  );
}

export async function queryLayer(layerName, latlng, timestamp) {
  const bbox = [
    latlng.lng - 0.05,
    latlng.lat - 0.05,
    latlng.lng + 0.05,
    latlng.lat + 0.05,
  ].join(',');

  // The original code used map bounds and size, but for WMS GetFeatureInfo on a specific point, 
  // calculating a small bbox around the point and clicking the center (X=50, Y=50 in a 100x100 grid) works exactly the same.
  const url =
    `/api/feature-info?` +
    `SERVICE=WMS&` +
    `VERSION=1.1.1&` +
    `REQUEST=GetFeatureInfo&` +
    `LAYERS=${layerName}&` +
    `QUERY_LAYERS=${layerName}&` +
    `INFO_FORMAT=text/plain&` +
    `FEATURE_COUNT=1&` +
    `FORMAT=image/png&` +
    `SRS=EPSG:4326&` +
    `WIDTH=100&` +
    `HEIGHT=100&` +
    `BBOX=${bbox}&` +
    `X=50&` +
    `Y=50` +
    `&TIME=${getIsoTime(timestamp)}`;

  const response = await fetch(url);
  return await response.text();
}

export async function reverseGeocode(latlng) {
  try {
    const response = await fetch(
      `/api/reverse-geocode?lat=${latlng.lat}&lon=${latlng.lng}`
    );
    const data = await response.json();
    return data.display_name;
  } catch (err) {
    console.error(err);
    return 'Không xác định';
  }
}

export function directionText(a) {
  if (a < 22.5) return 'Bắc';
  if (a < 67.5) return 'Đông Bắc';
  if (a < 112.5) return 'Đông';
  if (a < 157.5) return 'Đông Nam';
  if (a < 202.5) return 'Nam';
  if (a < 247.5) return 'Tây Nam';
  if (a < 292.5) return 'Tây';
  if (a < 337.5) return 'Tây Bắc';
  return 'Bắc';
}
