(function (root) {
  function zoneLabel(tz) {
    const id = { 'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' }[tz];
    if (id) return id;
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || tz;
    } catch { return tz; }
  }

  const CITIES = [
    ['Cikarang', -6.2615, 107.1528, 'Asia/Jakarta'], ['Bekasi', -6.2383, 106.9756, 'Asia/Jakarta'],
    ['Jakarta', -6.2088, 106.8456, 'Asia/Jakarta'], ['Bogor', -6.5971, 106.806, 'Asia/Jakarta'],
    ['Bandung', -6.9175, 107.6191, 'Asia/Jakarta'], ['Semarang', -6.9667, 110.4167, 'Asia/Jakarta'],
    ['Yogyakarta', -7.7956, 110.3695, 'Asia/Jakarta'], ['Surabaya', -7.2575, 112.7521, 'Asia/Jakarta'],
    ['Palembang', -2.9761, 104.7754, 'Asia/Jakarta'], ['Medan', 3.5952, 98.6722, 'Asia/Jakarta'],
    ['Denpasar', -8.6705, 115.2126, 'Asia/Makassar'], ['Balikpapan', -1.2379, 116.8529, 'Asia/Makassar'],
    ['Makassar', -5.1477, 119.4327, 'Asia/Makassar'], ['Jayapura', -2.5337, 140.7181, 'Asia/Jayapura'],
  ].map(([name, lat, lon, tz]) => ({ name, lat, lon, tz, zone: zoneLabel(tz) }));

  function place({ name, lat, lon, tz }) {
    let zone = tz;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { zone = 'Asia/Jakarta'; }
    return { name: String(name || 'Current location'), lat: +lat, lon: +lon, tz: zone, zone: zoneLabel(zone) };
  }

  root.Places = { CITIES, zoneLabel, place, city: (name) => CITIES.find((c) => c.name === name) || CITIES[0] };
})(typeof window !== 'undefined' ? window : globalThis);
