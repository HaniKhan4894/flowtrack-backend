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

        $userId = isset($userData['user_id']) ? (int) $userData['user_id'] : null;

        // Check permission if specified (multiple args = OR)
        if (!empty($arguments)) {
            // Get organization ID from request (set by AuthFilter) or query or token
            $organizationId = $request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $userData['organization_id'] ?? null;

            // Fallback: If still missing, try to fetch primary one (to be extra safe)
            if (!$organizationId && $userId) {
                $db = \Config\Database::connect();
                $orgMember = $db->table('organization_members')
                    ->where('user_id', $userId)
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

            $requiredPermissions = array_values(array_filter(array_map('strval', $arguments)));
            $hasPermission = false;
            foreach ($requiredPermissions as $requiredPermission) {
                if ($this->permissionService->userHasPermission(
                    $userId,
                    $organizationId,
                    $requiredPermission
                )) {
                    $hasPermission = true;
                    break;
                }
            }

            if (!$hasPermission) {
                return service('response')
                    ->setJSON([
                        'success' => false,
                        'message' => 'Insufficient permissions',
                        'required_permission' => $requiredPermissions[0] ?? null,
                    ])
                    ->setStatusCode(403);
            }

            $request->setGlobal('server', [
                ...$_SERVER,
                'FLOWTRACK_USER_ID' => $userId,
                'FLOWTRACK_EMAIL' => $userData['email'] ?? null,
                'FLOWTRACK_ROLE' => $userData['role'] ?? null,
                'FLOWTRACK_ORGANIZATION_ID' => (int) $organizationId,
            ]);
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
