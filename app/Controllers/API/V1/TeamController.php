<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\TeamService;

class TeamController extends ResourceController
{
    protected TeamService $teamService;
    protected $format = 'json';

    public function __construct()
    {
        $this->teamService = new TeamService();
    }

    private function organizationId(): int|\CodeIgniter\HTTP\ResponseInterface
    {
        $organizationId = (int) ($this->request->getGet('organization_id')
            ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID')
            ?? 0);

        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }

        return $organizationId;
    }

    /**
     * GET /api/v1/teams
     */
    public function index()
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $teams = $this->teamService->getTeams($organizationId);

            return $this->respond([
                'success' => true,
                'data' => $teams,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/teams/{id}
     */
    public function show($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $team = $this->teamService->getTeamById($organizationId, (int) $id);
            if (!$team) {
                return $this->failNotFound('Team not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/teams
     */
    public function create()
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true) ?? [];
            $team = $this->teamService->createTeam($organizationId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Team created successfully',
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/teams/{id}
     */
    public function update($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true) ?? [];
            $team = $this->teamService->updateTeam($organizationId, (int) $id, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Team updated successfully',
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/teams/{id}
     */
    public function delete($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $this->teamService->deleteTeam($organizationId, (int) $id);

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Team deleted successfully',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/teams/{id}/members
     */
    public function assignMembers($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true) ?? [];
            $userIds = $data['user_ids'] ?? $data['member_ids'] ?? [];

            if (!is_array($userIds) || empty($userIds)) {
                return $this->fail('user_ids is required', 400);
            }

            $team = $this->teamService->assignMembers($organizationId, (int) $id, $userIds);

            return $this->respond([
                'success' => true,
                'message' => 'Team members assigned successfully',
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/teams/{id}/members/{userId}
     */
    public function removeMember($id = null, $userId = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $team = $this->teamService->removeMember($organizationId, (int) $id, (int) $userId);

            return $this->respond([
                'success' => true,
                'message' => 'Team member removed successfully',
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/teams/{id}/lead
     */
    public function setLead($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true) ?? [];
            $leadUserId = array_key_exists('lead_user_id', $data) ? $data['lead_user_id'] : null;
            $leadUserId = $leadUserId !== null && $leadUserId !== '' ? (int) $leadUserId : null;

            $team = $this->teamService->setLead($organizationId, (int) $id, $leadUserId);

            return $this->respond([
                'success' => true,
                'message' => 'Team lead updated successfully',
                'data' => $team,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
