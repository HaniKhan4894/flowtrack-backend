<?php

namespace App\Filters;

use App\Services\ApiKeyService;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Phase 10 — Authenticates public API requests with an `X-Api-Key` header
 * (or `Authorization: Bearer <key>`), resolving the org/user context the same
 * way AuthFilter does so downstream controllers work unchanged.
 */
class ApiKeyFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        /** @var \CodeIgniter\HTTP\IncomingRequest $request */
        $key = trim((string) $request->getHeaderLine('X-Api-Key'));

        if ($key === '') {
            $auth = (string) $request->getHeaderLine('Authorization');
            if (stripos($auth, 'bearer ') === 0) {
                $key = trim(substr($auth, 7));
            }
        }

        if ($key === '') {
            return service('response')
                ->setJSON(['success' => false, 'message' => 'API key missing. Send it in the X-Api-Key header.'])
                ->setStatusCode(401);
        }

        $context = (new ApiKeyService())->resolve($key);
        if (!$context) {
            return service('response')
                ->setJSON(['success' => false, 'message' => 'Invalid or revoked API key.'])
                ->setStatusCode(401);
        }

        $request->setGlobal('server', [
            ...$_SERVER,
            'FLOWTRACK_USER_ID'         => $context['user_id'],
            'FLOWTRACK_ORGANIZATION_ID' => $context['organization_id'],
            'FLOWTRACK_API_KEY_ID'      => $context['api_key_id'],
            'FLOWTRACK_AUTH_MODE'       => 'api_key',
        ]);

        return $request;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // no-op
    }
}
