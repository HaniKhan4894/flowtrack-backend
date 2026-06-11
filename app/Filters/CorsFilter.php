<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

class CorsFilter implements FilterInterface
{
    private const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    private const ALLOW_HEADERS = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, ngrok-skip-browser-warning';

    private function applyCorsHeaders(ResponseInterface $response, ?string $origin = null): ResponseInterface
    {
        $allowOrigin = $this->resolveAllowOrigin($origin);

        return $response
            ->setHeader('Access-Control-Allow-Origin', $allowOrigin)
            ->setHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
            ->setHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
            ->setHeader('Access-Control-Expose-Headers', 'Authorization')
            ->setHeader('Access-Control-Max-Age', '3600');
    }

    private function resolveAllowOrigin(?string $origin): string
    {
        if (empty($origin)) {
            return '*';
        }

        if ($this->isOriginAllowed($origin)) {
            return $origin;
        }

        return '*';
    }

    private function isOriginAllowed(string $origin): bool
    {
        $origin = rtrim($origin, '/');
        $allowed = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
        ];

        $frontendUrl = env('app.frontendURL');
        if (! empty($frontendUrl)) {
            $allowed[] = rtrim((string) $frontendUrl, '/');
        }

        $deployConfigPath = ROOTPATH . 'config/deploy.json';
        if (is_file($deployConfigPath)) {
            $deploy = json_decode((string) file_get_contents($deployConfigPath), true);
            if (! empty($deploy['frontendUrl'])) {
                $allowed[] = rtrim((string) $deploy['frontendUrl'], '/');
            }
        }

        if (in_array($origin, $allowed, true)) {
            return true;
        }

        return (bool) preg_match('#\Ahttps://[\w.-]+\.vercel\.app\z#', $origin)
            || (bool) preg_match('#\Ahttps://[\w.-]+\.ngrok-free\.app\z#', $origin)
            || (bool) preg_match('#\Ahttps://[\w.-]+\.ngrok\.io\z#', $origin);
    }

    /**
     * Add CORS headers before request
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        $origin = $request->getHeaderLine('Origin');

        if (strtoupper($request->getMethod()) === 'OPTIONS') {
            return $this->applyCorsHeaders(service('response'), $origin ?: null)
                ->setStatusCode(204);
        }

        return $request;
    }

    /**
     * Add CORS headers after request
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        $origin = $request->getHeaderLine('Origin');

        return $this->applyCorsHeaders($response, $origin ?: null);
    }
}
