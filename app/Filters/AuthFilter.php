<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use App\Libraries\JWTHandler;

class AuthFilter implements FilterInterface
{
    protected $jwtHandler;

    public function __construct()
    {
        $this->jwtHandler = new JWTHandler();
    }

    /**
     * Verify JWT token before request
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        /** @var \CodeIgniter\HTTP\IncomingRequest $request */
        // Get token from Authorization header
        $authHeader = $request->getHeaderLine('Authorization');
        $token = null;

        if ($authHeader) {
            $token = $this->jwtHandler->extractTokenFromHeader($authHeader);
        }

        if (!$token) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Authentication token missing'
                ])
                ->setStatusCode(401);
        }

        // Verify token
        $userData = $this->jwtHandler->getUserFromToken($token);

        if (!$userData) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Invalid or expired token'
                ])
                ->setStatusCode(401);
        }

        // Attach user data to request context via server bag (IDE-safe)
        $userId = isset($userData['user_id']) ? (int) $userData['user_id'] : null;

        $organizationId = $userData['organization_id'] ?? null;
        $organizationId = $organizationId ? (int)$organizationId : null;

        // Fallback: If organization_id is missing from token, fetch primary one from DB
        $userId = $userId ?? ($userData['sub'] ?? null); // Assuming 'sub' might be used for user_id in some JWTs
        if (!$organizationId && $userId) {
            $db = \Config\Database::connect();
            $orgMember = $db->table('organization_members')
                ->where('user_id', $userId)
                ->orderBy('joined_at', 'ASC')
                ->get()
                ->getRow();
            
            if ($orgMember) {
                $organizationId = $orgMember->organization_id;
            }
        }

        $request->setGlobal('server', [
            ...$_SERVER,
            'FLOWTRACK_USER_ID' => $userId,
            'FLOWTRACK_EMAIL' => $userData['email'] ?? null,
            'FLOWTRACK_ROLE' => $userData['role'] ?? null,
            'FLOWTRACK_ORGANIZATION_ID' => $organizationId ? (int) $organizationId : null,
        ]);

        return $request;
    }

    /**
     * After request (not used)
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // Do nothing
    }
}
