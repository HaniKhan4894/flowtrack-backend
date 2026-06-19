const { execSync } = require('child_process');
const os = require('os');

function normalizeMac(raw) {
  const hex = String(raw || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g).join(':');
}

function getDefaultGatewayMac() {
  try {
    if (process.platform === 'win32') {
      const routeOut = execSync('route print 0.0.0.0', { encoding: 'utf8', timeout: 3000 });
      const gatewayMatch = routeOut.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/);
      const gatewayIp = gatewayMatch ? gatewayMatch[1] : null;
      if (!gatewayIp) return null;

      const arpOut = execSync('arp -a', { encoding: 'utf8', timeout: 3000 });
      const line = arpOut.split('\n').find((l) => l.includes(gatewayIp));
      if (!line) return null;
      const macMatch = line.match(/([0-9a-fA-F]{2}([-:])){5}[0-9a-fA-F]{2}/);
      return macMatch ? normalizeMac(macMatch[0]) : null;
    }

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const routeOut = execSync('route -n get default 2>/dev/null || ip route | grep default', { encoding: 'utf8', timeout: 3000 });
      const gatewayMatch = routeOut.match(/(\d+\.\d+\.\d+\.\d+)/);
      const gatewayIp = gatewayMatch ? gatewayMatch[1] : null;
      if (!gatewayIp) return null;
      const arpOut = execSync(`arp -n ${gatewayIp} 2>/dev/null || arp ${gatewayIp}`, { encoding: 'utf8', timeout: 3000 });
      const macMatch = arpOut.match(/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/);
      return macMatch ? normalizeMac(macMatch[0]) : null;
    }
  } catch (_err) {
    return null;
  }

  return null;
}

function getPublicIpHint() {
  return null;
}

module.exports = {
  getDefaultGatewayMac,
  getPublicIpHint,
  normalizeMac,
};
