<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminAnnouncementService;

/**
 * Platform announcements (super-admin only).
 */
class AdminAnnouncementController extends AdminBaseController
{
    protected AdminAnnouncementService $service;

    public function __construct()
    {
        $this->service = new AdminAnnouncementService();
    }

    /** GET /api/v1/admin/announcements */
    public function index()
    {
        return $this->ok($this->service->list());
    }

    /** POST /api/v1/admin/announcements */
    public function create()
    {
        $data = $this->payload();

        return $this->attempt(fn () => $this->service->create($data, $this->adminId()), 'Announcement published');
    }

    /** PUT /api/v1/admin/announcements/{id} */
    public function update($id = null)
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->service->update((int) $id, $data, $this->adminId()),
            'Announcement updated'
        );
    }

    /** DELETE /api/v1/admin/announcements/{id} */
    public function delete($id = null)
    {
        return $this->attempt(function () use ($id) {
            $this->service->delete((int) $id, $this->adminId());

            return ['id' => (int) $id, 'deleted' => true];
        }, 'Announcement deleted');
    }

    /** POST /api/v1/admin/announcements/{id}/resend */
    public function resend($id = null)
    {
        return $this->attempt(
            fn () => $this->service->resend((int) $id, $this->adminId()),
            'Announcement resent'
        );
    }
}
