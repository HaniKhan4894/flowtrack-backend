<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ActivityLogService;
use App\Services\OrganizationSettingsService;
use App\Services\TeamScopeService;
use App\Services\PermissionService;
use App\Services\TimeEntryService;

class ActivityLogController extends ResourceController
{
    /** @var \App\Services\ActivityLogService */
    protected $activityLogService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->activityLogService = new \App\Services\ActivityLogService();
        $this->teamScopeService = new TeamScopeService();
    }

    /**
     * GET /api/v1/activity-logs?user_id=1&category=productive&start_date=2024-01-01&page=1
     */
    public function index()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }
            
            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($userId, $organizationId, 'activity.view_team');

            $requestedUserId = $this->request->getGet('user_id');
            if (!$canViewTeam) {
                $targetUserId = $userId;
            } elseif ($requestedUserId) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($userId, $organizationId, $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
            } else {
                $targetUserId = $userId;
            }

            $filters = [
                'user_id' => $targetUserId,
                'organization_id' => $organizationId,
                'time_entry_id' => $this->request->getGet('time_entry_id'),
                'category' => $this->request->getGet('category'),
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 50,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->activityLogService->getActivityLogs($filters);

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
     * POST /api/v1/activity-logs/sync
     * Batch log activity
     */
    public function sync()
    {
        try {
            /** @var \App\Entities\User $user */
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $settingsService = new OrganizationSettingsService();
            $tracking = $settingsService->getEffectiveTrackingConfig($organizationId);
            $activityEnabled = filter_var($tracking['activity_tracking_enabled'] ?? true, FILTER_VALIDATE_BOOLEAN);

            $data = $this->request->getJSON(true);
            if (!is_array($data)) {
                return $this->fail('Invalid JSON payload', 400);
            }

            if (!isset($data['time_entry_id'])) {
                return $this->fail('time_entry_id is required', 400);
            }

            $entry = (new \App\Models\TimeEntryModel())->find((int) $data['time_entry_id']);
            if (!$entry || (int) $entry['user_id'] !== $userId) {
                return $this->fail('Invalid time entry context', 404);
            }

            // A stopped or paused timer must not keep collecting: the desktop client can lose
            // the stop signal (crash, offline, timer stopped elsewhere) and would otherwise
            // pile hours of "activity" onto a finished entry.
            $collecting = $this->activityLogService->isEntryCollecting($entry);

            // Batch payload uses `logs`; single-segment payloads include app_name/window_title.
            if (isset($data['logs']) && is_array($data['logs'])) {
                $logs = $data['logs'];
            } elseif (isset($data['app_name']) || isset($data['window_title'])) {
                $logs = [$data];
            } else {
                $logs = [];
            }
            if (!$activityEnabled) {
                $logs = [];
            } elseif (empty($tracking['url_tracking_enabled'])) {
                foreach ($logs as &$log) {
                    if (is_array($log)) {
                        $log['url'] = '';
                    }
                }
                unset($log);
            }
            $batchIdleSeconds = (int) ($data['idle_seconds'] ?? 0);
            $batchActiveSeconds = (int) ($data['active_seconds'] ?? 0);

            $stored = 0;
            $rejected = 0;
            foreach ($logs as $log) {
                if (!is_array($log)) {
                    continue;
                }
                unset($log['idle_seconds'], $log['active_seconds'], $log['metadata']);
                $result = $this->activityLogService->logActivity($data['time_entry_id'], $userId, $log);
                if ($result === null) {
                    $rejected++;
                    continue;
                }
                $stored++;
            }

            if ($collecting && ($batchIdleSeconds > 0 || $batchActiveSeconds > 0)) {
                $this->activityLogService->recordIdleStats(
                    $userId,
                    (int) $entry['organization_id'],
                    date('Y-m-d H:i:s'),
                    (int) $batchIdleSeconds,
                    (int) $batchActiveSeconds
                );

                if (!empty($data['client_router_mac']) || !empty($data['router_mac'])) {
                    try {
                        (new TimeEntryService())->updateWorkLocationFromClient(
                            (int) $data['time_entry_id'],
                            (int) $entry['organization_id'],
                            $data
                        );
                    } catch (\Throwable $locationError) {
                        log_message('warning', 'Work location update skipped: ' . $locationError->getMessage());
                    }
                }
            }

            if ($rejected > 0) {
                log_message(
                    'info',
                    sprintf(
                        'Activity sync: dropped %d out-of-window segment(s) for entry %d (user %d).',
                        $rejected,
                        (int) $data['time_entry_id'],
                        $userId
                    )
                );
            }

            return $this->respondCreated([
                'success' => true,
                'message' => $activityEnabled ? 'Activity logs synced successfully' : 'Idle stats recorded (activity tracking disabled)',
                'count' => $stored,
                'rejected' => $rejected,
                'entry_closed' => !empty($entry['ended_at']),
                'entry_paused' => empty($entry['ended_at']) && !empty($entry['paused_at']),
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Activity sync failed: ' . $e->getMessage());
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/activity-logs
     */
    public function create()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }
            $data = $this->request->getJSON(true);

            $rules = [
                'time_entry_id' => 'required|is_natural_no_zero',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $log = $this->activityLogService->logActivity($data['time_entry_id'], $userId, $data);
            if ($log === null) {
                return $this->fail('Activity falls outside the timer window', 409);
            }

            return $this->respondCreated([
                'success' => true,
                'message' => 'Activity logged successfully',
                'data' => $log
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/activity-logs/productivity-stats?user_id=1&start_date=2024-01-01&end_date=2024-01-31
     */
    public function productivityStats()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }
            
            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'activity.view_team');

            $requestedUserId = $this->request->getGet('user_id') ?? $currentUserId;
            if (!$canViewTeam) {
                $targetUserId = $currentUserId;
            } else {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
            }

            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$startDate || !$endDate) {
                return $this->fail('start_date and end_date are required', 400);
            }

            $stats = $this->activityLogService->getProductivityStats($targetUserId, $startDate, $endDate);

            return $this->respond([
                'success' => true,
                'data' => $stats
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/activity-logs/top-apps?user_id=1&start_date=...&end_date=...
     */
    public function topApps()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'activity.view_team');

            $requestedUserId = $this->request->getGet('user_id');
            if (!$canViewTeam) {
                $targetUserId = $currentUserId;
            } elseif ($requestedUserId) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
            } else {
                $targetUserId = $currentUserId;
            }

            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$startDate || !$endDate) {
                return $this->fail('start_date and end_date are required', 400);
            }

            $stats = $this->activityLogService->getTopApps($targetUserId, $startDate, $endDate);

            return $this->respond([
                'success' => true,
                'data' => $stats,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
