// Approximate positions for the cities and areas we work in. A visit is placed at its area (or city) centre,
// so no address is ever sent to an outside service. The pin shows roughly where, not which house.
export interface Point { lat: number; lng: number; precision: 'area' | 'city' }

const CITY: Record<string, [number, number]> = {
  ahmedabad: [23.0225, 72.5714], surat: [21.1702, 72.8311], vadodara: [22.3072, 73.1812], rajkot: [22.3039, 70.8022], gandhinagar: [23.2156, 72.6369],
  bharuch: [21.7051, 72.9959], anand: [22.5645, 72.9289], bhavnagar: [21.7645, 72.1519], jamnagar: [22.4707, 70.0577],
};
const AREA: Record<string, [number, number]> = {
  // Ahmedabad
  satellite: [23.0300, 72.5200], bopal: [23.0340, 72.4650], maninagar: [22.9950, 72.6030], naranpura: [23.0580, 72.5560], vastrapur: [23.0390, 72.5290],
  chandkheda: [23.1050, 72.5810], gota: [23.1000, 72.5400], thaltej: [23.0500, 72.5000], naroda: [23.0700, 72.6500], nikol: [23.0450, 72.6700],
  // Surat
  adajan: [21.1950, 72.7930], vesu: [21.1400, 72.7700], pal: [21.2050, 72.7800], varachha: [21.2150, 72.8600], katargam: [21.2300, 72.8300],
  piplod: [21.1450, 72.7800], udhna: [21.1700, 72.8450], althan: [21.1500, 72.8000],
  // Vadodara
  alkapuri: [22.3100, 73.1700], manjalpur: [22.2650, 73.1900], gotri: [22.3150, 73.1350], akota: [22.2950, 73.1650], 'waghodia road': [22.3100, 73.2300], karelibaug: [22.3250, 73.2050],
  // Rajkot
  'kalawad road': [22.3050, 70.7700], 'university road': [22.2850, 70.7700], mavdi: [22.2650, 70.7700], 'raiya road': [22.2850, 70.8000], 'gondal road': [22.2650, 70.8200],
  // Gandhinagar
  'sector 21': [23.2300, 72.6500], 'sector 7': [23.2400, 72.6400], kudasan: [23.1900, 72.6400], sargasan: [23.1900, 72.6200], raysan: [23.1700, 72.6500],
  // Bharuch, Anand, Bhavnagar, Jamnagar
  zadeshwar: [21.7400, 72.9900], 'station road': [21.7100, 72.9900], 'dahej bypass': [21.7200, 72.9800],
  vidyanagar: [22.5500, 72.9200], 'lambhvel road': [22.5400, 72.9500], 'borsad chokdi': [22.5600, 72.9500],
  kaliyabid: [21.7600, 72.1400], 'waghawadi road': [21.7700, 72.1500], sidsar: [21.8000, 72.1700],
  'patel colony': [22.4700, 70.0700], 'ranjit road': [22.4600, 70.0600], 'pandit nehru marg': [22.4700, 70.0600],
};

/** Where on the map does this address belong? Null when neither the area nor the city is known. */
export function locate(address?: string | null, city?: string | null): Point | null {
  const text = `${address || ''}`.toLowerCase();
  // the longest area name that appears in the address wins ("sector 21" before "sector 2")
  const area = Object.keys(AREA).filter((a) => text.includes(a)).sort((a, b) => b.length - a.length)[0];
  if (area) return { lat: AREA[area][0], lng: AREA[area][1], precision: 'area' };
  const c = CITY[String(city || '').trim().toLowerCase()];
  return c ? { lat: c[0], lng: c[1], precision: 'city' } : null;
}

export const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export const routeKm = (pts: { lat: number; lng: number }[]) => pts.reduce((s, p, i) => (i ? s + km(pts[i - 1], p) : 0), 0);

/** A sensible visiting order: always go to the nearest stop that is left. */
export function shortestOrder<T extends { lat: number; lng: number }>(pts: T[]): T[] {
  if (pts.length < 3) return pts;
  const left = [...pts];
  const out = [left.shift() as T];
  while (left.length) {
    const last = out[out.length - 1];
    let best = 0;
    left.forEach((p, i) => { if (km(last, p) < km(last, left[best])) best = i; });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}
