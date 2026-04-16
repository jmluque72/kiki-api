const os = require('node:os');

/**
 * Origen HTTP(S) cuya IP es red privada (RFC 1918) o loopback.
 * Sirve para CORS y para logs sin hardcodear la IP de la máquina.
 */
function isPrivateLanHttpOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const octets = host.split('.');
    if (octets.length !== 4) return false;
    const n = octets.map((x) => Number.parseInt(x, 10));
    if (n.some((x) => Number.isNaN(x) || x < 0 || x > 255)) return false;
    const [a, b] = n;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (!isV4 || net.internal) continue;
      out.push({ interface: name, address: net.address });
    }
  }
  return out;
}

module.exports = {
  isPrivateLanHttpOrigin,
  getLocalIPv4Addresses,
};
