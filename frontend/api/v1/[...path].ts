import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_BACKEND_API =
  'https://8b8a-124-109-46-74.ngrok-free.app/flowtrack-backend/public/api/v1';

function getBackendApiBase(): string {
  return (process.env.BACKEND_API_URL || DEFAULT_BACKEND_API).replace(/\/$/, '');
}

function buildTargetUrl(req: VercelRequest): string {
  const pathParam = req.query.path;
  const segments = Array.isArray(pathParam)
    ? pathParam
    : pathParam
      ? String(pathParam).split('/')
      : [];
  const routePath = segments.map((part) => encodeURIComponent(part)).join('/');

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path' || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
    } else {
      query.append(key, String(value));
    }
  }

  const queryString = query.toString();
  const base = getBackendApiBase();
  return `${base}/${routePath}${queryString ? `?${queryString}` : ''}`;
}

function buildUpstreamHeaders(req: VercelRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
    Accept: 'application/json',
  };

  const forward = ['authorization', 'content-type', 'x-requested-with'] as const;
  for (const name of forward) {
    const value = req.headers[name];
    if (value) {
      headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  }

  if (!headers['content-type'] && req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    headers['content-type'] = 'application/json';
  }

  return headers;
}

function buildRequestBody(req: VercelRequest): string | undefined {
  if (!req.method || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return undefined;
  }

  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  return JSON.stringify(req.body);
}

function applyCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const targetUrl = buildTargetUrl(req);
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: buildUpstreamHeaders(req),
      body: buildRequestBody(req),
    });

    const responseBody = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    return res.status(upstream.status).send(responseBody);
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message: 'API proxy failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
