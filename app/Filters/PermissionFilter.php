<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use App\Libraries\JWTHandler;
use App\Services\PermissionService;

class PermissionFilter implements FilterInterface
{
    protected $jwtHandler;
    protected $permissionService;

    public function __construct()
    {
        $this->jwtHandler = new JWTHandler();
        $this->permissionService = new PermissionService();
    }

    /**
     * Check if user has required permission
     * 
     * Usage in routes:
     * $routes->get('users', 'UserController::index', ['filter' => 'permission:users.view']);
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        /** @var \CodeIgniter\HTTP\IncomingRequest $request */
        // Get token from Authorization header or 'token' query parameter
        $authHeader = $request->getHeaderLine('Authorization');
        $token = null;

        if ($authHeader) {
            $token = $this->jwtHandler->extractTokenFromHeader($authHeader);
        } else {
            $token = $request->getGet('token');
        }

        if (!$token) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Authentication token missing'
                ])
                ->setStatusCode(401);
        }

        // Extract and verify token
        $userData = $this->jwtHandler->getUserFromToken($token);

        if (!$userData) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Invalid or expired token'
                ])
                ->setStatusCode(401);
        }

        // Attach user data to request
        $userId = $userData['user_id'] ?? null;
        $request->user_id = $userId ? (int) $userId : null;
        $request->email = $userData['email'] ?? null;
        $request->role = $userData['role'] ?? null;

        // Check permission if specified
        if (!empty($arguments)) {
            $requiredPermission = $arguments[0];

            // Get organization ID from request (set by AuthFilter) or query or token
            $organizationId = $request->organization_id ?? service('request')->getGet('organization_id') ?? $userData['organization_id'] ?? null;

            // Fallback: If still missing, try to fetch primary one (to be extra safe)
            if (!$organizationId && isset($request->user_id)) {
                $db = \Config\Database::connect();
                $orgMember = $db->table('organization_members')
                    ->where('user_id', $request->user_id)
                    ->orderBy('joined_at', 'ASC')
                    ->get()
                    ->getRowArray();

                if ($orgMember) {
                    $organizationId = (int) $orgMember['organization_id'];
                }
            }

            if (!$organizationId) {
                return service('response')
                    ->setJSON([
                        'success' => false,
                        'message' => 'Organization context required'
                    ])
                    ->setStatusCode(400);
            }

            $hasPermission = $this->permissionService->userHasPermission(
                $request->user_id,
                $organizationId,
                $requiredPermission
            );

            if (!$hasPermission) {
                return service('response')
                    ->setJSON([
                        'success' => false,
                        'message' => 'Insufficient permissions',
                        'required_permission' => $requiredPermission
                    ])
                    ->setStatusCode(403);
            }

            // Attach organization_id to request
            $request->organization_id = $organizationId;
        }

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
