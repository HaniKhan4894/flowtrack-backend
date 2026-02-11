<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use App\Models\OrganizationMemberModel;
use App\Models\RoleModel;

class AdminFilter implements FilterInterface
{
    protected $memberModel;
    protected $roleModel;

    public function __construct()
    {
        $this->memberModel = new OrganizationMemberModel();
        $this->roleModel = new RoleModel();
    }

    /**
     * Check if user has admin role in organization context
     * Now works with new permission system
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        // Get user_id from request (set by AuthFilter)
        $userId = $request->user_id ?? null;
        
        if (!$userId) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Authentication required'
                ])
                ->setStatusCode(401);
        }

        // Get organization_id from query params
        $organizationId = $request->getGet('organization_id');

        if (!$organizationId) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'organization_id parameter required'
                ])
                ->setStatusCode(400);
        }

        // Get user's role in this organization
        $member = $this->memberModel
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$member || !$member['role_id']) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Not a member of this organization'
                ])
                ->setStatusCode(403);
        }

        // Get role details
        $role = $this->roleModel->find($member['role_id']);

        if (!$role) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Invalid role'
                ])
                ->setStatusCode(403);
        }

        // Check if role is owner or admin
        if (!in_array($role['slug'], ['owner', 'admin'])) {
            return service('response')
                ->setJSON([
                    'success' => false,
                    'message' => 'Admin or Owner access required',
                    'your_role' => $role['slug']
                ])
                ->setStatusCode(403);
        }

        // Attach organization_id to request for controllers
        $request->organization_id = $organizationId;

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
