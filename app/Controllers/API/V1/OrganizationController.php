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
            $activeMap = (new \App\Services\AdvancedMonitoringService())->getActiveSessionsMap((int) $id);
            $members = array_map(function ($member) use ($activeMap) {
                $uid = (int) ($member['user_id'] ?? 0);
                $member['advanced_monitoring_active'] = isset($activeMap[$uid]);
                if (isset($activeMap[$uid])) {
                    $member['advanced_monitoring_session'] = $activeMap[$uid];
                }
                return $member;
            }, $result['data']);

            return $this->respond([
                'success' => true,
                'data' => $members,
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
                'role' => 'permit_empty|in_list[admin,manager,team_lead,member]',
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
                $inviterUserId,
                is_array($data['project_ids'] ?? null) ? $data['project_ids'] : []
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
                        'project_ids' => $member['project_ids'] ?? [],
                        'link' => rtrim((string)getenv('app.frontendURL'), '/') . '/register?invitation_token=' . $member['token']
                    ]
                ]);
            }

            $message = 'Member added successfully';
            if (($member['status'] ?? null) === 'projects_assigned') {
                $message = 'Projects assigned to existing member';
            }

            return $this->respondCreated([
                'success' => true,
                'message' => $message,
                'data' => $member
            ]);

        } catch (\Exception $e) {
            if (str_contains($e->getMessage(), 'limit reached')) {
                return $this->respond([
                    'status' => 403,
                    'error' => 403,
                    'error_code' => 'PLAN_LIMIT_REACHED',
                    'message' => $e->getMessage(),
                    'messages' => ['error' => $e->getMessage()],
                ], 403);
            }
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
     * PUT /api/v1/organizations/{id}/members/{userId}
     */
    public function updateMember($id = null, $userId = null)
    {
        try {
            $data = $this->request->getJSON(true) ?? [];
            $member = $this->organizationService->updateMember((int) $id, (int) $userId, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Member updated successfully',
                'data' => $member,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/organizations/{id}/members/{userId}/projects
     * Body: { project_ids: number[] } — replaces the member's project assignments
     */
    public function syncMemberProjects($id = null, $userId = null)
    {
        try {
            $organizationId = (int) $id;
            $memberUserId = (int) $userId;
            $actorId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true) ?? [];
            $projectIds = is_array($data['project_ids'] ?? null) ? $data['project_ids'] : [];

            $orgMember = (new \App\Models\OrganizationMemberModel())
                ->where('organization_id', $organizationId)
                ->where('user_id', $memberUserId)
                ->first();

            if (!$orgMember) {
                return $this->failNotFound('Member not found in this organization');
            }

            $service = new \App\Services\ProjectMemberService();
            $assigned = $service->syncUserProjects(
                $organizationId,
                $memberUserId,
                $projectIds,
                $actorId ?: null
            );

            return $this->respond([
                'success' => true,
                'message' => 'Member projects updated',
                'data' => [
                    'user_id' => $memberUserId,
                    'project_ids' => $assigned,
                ],
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
