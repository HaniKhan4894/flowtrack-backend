<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\OrganizationSettingsService;
use App\Services\ScreenshotService;
use App\Services\TeamScopeService;
use App\Services\PermissionService;

class ScreenshotController extends ResourceController
{
    protected $screenshotService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->screenshotService = new ScreenshotService();
        $this->teamScopeService = new TeamScopeService();
    }

    /**
     * GET /api/v1/screenshots?user_id=1&time_entry_id=5&start_date=2024-01-01&page=1
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
            $canViewTeam = $permissionService->userHasPermission($userId, $organizationId, 'screenshots.view_team');
            $settingsService = new OrganizationSettingsService();

            if (!$canViewTeam && $settingsService->areScreenshotsHiddenFromUser($organizationId, $userId)) {
                return $this->fail('Screenshots are hidden from users in your organization.', 403);
            }

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
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->screenshotService->getScreenshots($filters);

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
     * POST /api/v1/screenshots/upload
     */
    public function upload()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);

            $monitoring = new \App\Services\MemberMonitoringService();
            if ($organizationId && !$monitoring->canCaptureScreenshots($organizationId, $userId)) {
                return $this->fail('Screenshot capture is disabled for your account.', 403);
            }

            $timeEntryId = $this->request->getPost('time_entry_id');

            if (!$timeEntryId) {
                return $this->fail('time_entry_id is required', 400);
            }

            $file = $this->request->getFile('screenshot');

            if (!$file || !$file->isValid()) {
                return $this->fail('No valid screenshot file uploaded', 400);
            }

            $data = [
                'is_blurred' => $this->request->getPost('is_blurred') ?? false,
                'activity_level' => $this->request->getPost('activity_level') ?? 0,
            ];

            $subscriptionService = new \App\Services\SubscriptionService();
            if ($organizationId && $subscriptionService->checkFeatureLimit($organizationId, 'screenshot_blur')) {
                $data['apply_blur'] = true;
            }

            $screenshot = $this->screenshotService->saveScreenshot($timeEntryId, $userId, $file, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Screenshot uploaded successfully',
                'data' => $screenshot
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/screenshots/time-entry/{timeEntryId}
     */
    public function show($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $screenshot = $this->screenshotService->getScreenshot((int)$id);
            if (!$screenshot) {
                return $this->failNotFound('Screenshot not found');
            }
            if ((int)$screenshot['user_id'] !== $userId) {
                return $this->fail('Forbidden', 403);
            }

            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $settingsService = new OrganizationSettingsService();
            if ($settingsService->areScreenshotsHiddenFromUser($organizationId, $userId)) {
                return $this->fail('Screenshots are hidden from users in your organization.', 403);
            }

            return $this->respond([
                'success' => true,
                'data' => $screenshot,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/screenshots/time-entry/{timeEntryId}
     */
    public function byTimeEntry($timeEntryId = null)
    {
        try {
            $screenshots = $this->screenshotService->getScreenshotsByTimeEntry($timeEntryId);

            return $this->respond([
                'success' => true,
                'data' => $screenshots
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function view($id = null)
    {
        return $this->serveScreenshotFile((int) $id, false);
    }

    public function thumbnail($id = null)
    {
        return $this->serveScreenshotFile((int) $id, true);
    }

    private function serveScreenshotFile(int $id, bool $thumbnail)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $screenshot = $this->screenshotService->getScreenshot($id);
            if (!$screenshot) {
                return $this->fail('Screenshot not found', 404);
            }

            if (!$this->screenshotService->canViewScreenshot($userId, $organizationId, $screenshot)) {
                return $this->fail('Forbidden', 403);
            }

            $relativePath = $this->screenshotService->resolveFilePath($screenshot, $thumbnail);
            $path = WRITEPATH . 'uploads/screenshots/' . $relativePath;

            if (!file_exists($path)) {
                return $this->fail('File not found', 404);
            }

            $mimeType = mime_content_type($path) ?: 'image/jpeg';

            return $this->response
                ->setHeader('Content-Type', $mimeType)
                ->setHeader('Cache-Control', 'private, max-age=3600')
                ->setBody(file_get_contents($path));

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/screenshots/(:num)
     */
    public function delete($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $settingsService = new OrganizationSettingsService();
            if ($settingsService->areScreenshotsHiddenFromUser($organizationId, $userId)) {
                return $this->fail('Screenshots are hidden from users in your organization.', 403);
            }

            $tracking = $settingsService->getEffectiveTrackingConfig($organizationId);
            if (!empty($tracking['screenshot_disallow_deleting'])) {
                return $this->fail('Deleting screenshots is disabled by organization policy.', 403);
            }

            $deleted = $this->screenshotService->deleteScreenshot($id, $userId);

            if (!$deleted) {
                return $this->fail('Failed to delete screenshot', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Screenshot deleted successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
