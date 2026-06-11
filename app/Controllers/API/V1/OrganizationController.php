<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\OrganizationService;

class OrganizationController extends ResourceController
{
    protected $organizationService;
    protected $format = 'json';

    public function __construct()
    {
        $this->organizationService = new OrganizationService();
    }

    /**
     * GET /api/v1/organizations/{id}
     */
    public function show($id = null)
    {
        try {
            $org = $this->organizationService->getOrganizationById($id);

            if (!$org) {
                return $this->failNotFound('Organization not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $org
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/organizations
     */
    public function create()
    {
        try {
            $ownerId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$ownerId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);

            $rules = [
                'name' => 'required|max_length[255]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $org = $this->organizationService->createOrganization($ownerId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Organization created successfully',
                'data' => $org
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/organizations/{id}
     */
    public function update($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            $updated = $this->organizationService->updateOrganization($id, $data);

            if (!$updated) {
                return $this->fail('Failed to update organization', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Organization updated successfully',
                'data' => $this->organizationService->getOrganizationById($id)
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/organizations/{id}/members?role=admin&page=1
     */
    public function members($id = null)
    {
        try {
            $filters = [
                'role' => $this->request->getGet('role'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->organizationService->getMembers($id, $filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination']
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/organizations/{id}/members
     */
    public function addMember($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            // Validation - supports either user_id or email
            $rules = [
                'user_id' => 'permit_empty|is_natural_no_zero',
                'email' => 'permit_empty|valid_email',
                'role' => 'permit_empty|in_list[admin,manager,member]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $userId = $data['user_id'] ?? null;
            $email = $data['email'] ?? null;

            if (!$userId && !$email) {
                return $this->fail('Either user_id or email is required', 400);
            }

            // NOTE: We do NOT resolve user by email here.
            // OrganizationService::addMember() handles both cases:
            // 1) If a user with this email exists -> adds them directly
            // 2) If no user exists -> creates an invitation with a secure token
            $inviterUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0) ?: null;

            $member = $this->organizationService->addMember(
                $id,
                $userId,
                $data['role'] ?? 'member',
                $data['hourly_rate'] ?? null,
                $email,
                $inviterUserId
            );

            // Check if it was an invitation
            if (isset($member['token'])) {
                // Construct invitation link (frontend URL)
                // Assuming frontend runs on different port or same domain
                // We'll return the token and let frontend construct the link
                return $this->respondCreated([
                    'success' => true,
                    'message' => isset($member['status']) && $member['status'] === 're-invited' ? 'Invitation resent successfully' : 'Invitation created successfully',
                    'data' => [
                        'invitation' => true,
                        'email' => $email,
                        'token' => $member['token'],
                        'expires_at' => $member['expires_at'],
                        'link' => rtrim((string)getenv('app.frontendURL'), '/') . '/register?invitation_token=' . $member['token']
                    ]
                ]);
            }

            return $this->respondCreated([
                'success' => true,
                'message' => 'Member added successfully',
                'data' => $member
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/organizations/{id}/members/{userId}
     */
    public function removeMember($id = null, $userId = null)
    {
        try {
            $removed = $this->organizationService->removeMember((int) $id, (int) $userId);

            if (!$removed) {
                return $this->fail('Failed to remove member', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Member removed successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/organizations/{id}/members/{userId}/monitoring
     */
    public function getMemberMonitoring($id = null, $userId = null)
    {
        try {
            $settings = (new \App\Services\MemberMonitoringService())->getSettings((int) $id, (int) $userId);

            return $this->respond([
                'success' => true,
                'data' => $settings,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/organizations/{id}/members/{userId}/monitoring
     */
    public function updateMemberMonitoring($id = null, $userId = null)
    {
        try {
            $data = $this->request->getJSON(true) ?? [];
            $settings = (new \App\Services\MemberMonitoringService())->updateSettings((int) $id, (int) $userId, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Monitoring settings updated',
                'data' => $settings,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/invitations/validate?token=...
     */
    public function validateInvitation()
    {
        try {
            $token = $this->request->getGet('token');
            if (!$token) {
                return $this->fail('Token is required', 400);
            }

            $invite = (new \App\Models\InvitationModel())
                ->where('token', $token)
                ->where('expires_at >=', date('Y-m-d H:i:s'))
                ->first();

            if (!$invite) {
                return $this->failNotFound('Invitation is invalid or expired');
            }

            return $this->respond([
                'success' => true,
                'data' => [
                    'organization_id' => $invite['organization_id'],
                    'email' => $invite['email'],
                    'role' => $invite['role'],
                    'expires_at' => $invite['expires_at'],
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
