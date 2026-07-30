<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

class CorsFilter implements FilterInterface
{
    private const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    private const ALLOW_HEADERS = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, ngrok-skip-browser-warning';

    private function allowedOrigins(): array
    {
        $origins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'https://flowtrackhani.vercel.app',
        ];

        $frontendUrl = env('app.frontendURL');
        if (! empty($frontendUrl)) {
            $origins[] = rtrim((string) $frontendUrl, '/');
        }

        $deployConfigPath = ROOTPATH . 'config/deploy.json';
        if (is_file($deployConfigPath)) {
            $deploy = json_decode((string) file_get_contents($deployConfigPath), true);
            if (! empty($deploy['frontendUrl'])) {
                $origins[] = rtrim((string) $deploy['frontendUrl'], '/');
            }
        }

        return array_values(array_unique($origins));
    }

    private function resolveAllowOrigin(?string $origin): string
    {
        if (empty($origin)) {
            return '*';
        }

        $origin = rtrim($origin, '/');

        if (in_array($origin, $this->allowedOrigins(), true)) {
            return $origin;
        }

        if (preg_match('#\Ahttps://[\w.-]+\.vercel\.app\z#', $origin)) {
            return $origin;
        }

        return '*';
    }

    private function applyCorsHeaders(ResponseInterface $response, ?string $origin = null): ResponseInterface
    {
        return $response
            ->setHeader('Access-Control-Allow-Origin', $this->resolveAllowOrigin($origin))
            ->setHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
            ->setHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
            ->setHeader('Access-Control-Expose-Headers', 'Authorization')
            ->setHeader('Access-Control-Max-Age', '3600');
    }

    public function before(RequestInterface $request, $arguments = null)
    {
        $origin = $request->getHeaderLine('Origin');

        if (strtoupper($request->getMethod()) === 'OPTIONS') {
            return $this->applyCorsHeaders(service('response'), $origin ?: null)
                ->setStatusCode(204);
        }

        return $request;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        $origin = $request->getHeaderLine('Origin');

        return $this->applyCorsHeaders($response, $origin ?: null);
    }
}
