<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminAnnouncementService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Read-side of platform announcements for signed-in members.
 */
class AnnouncementController extends ResourceController
{
    protected $format = 'json';

    /** GET /api/v1/announcements */
    public function index()
    {
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);

        return $this->respond([
            'success' => true,
            'data' => (new AdminAnnouncementService())->activeForUser($userId, $organizationId ?: null),
        ]);
    }

    /** POST /api/v1/announcements/{id}/dismiss */
    public function dismiss($id = null)
    {
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        (new AdminAnnouncementService())->dismissForUser((int) $id, $userId);

        return $this->respond(['success' => true, 'message' => 'Announcement dismissed']);
    }
}
