<?php

namespace App\Controllers\API\V1;

use App\Services\SmartNotificationService;
use CodeIgniter\RESTful\ResourceController;

class SmartNotificationController extends ResourceController
{
    protected SmartNotificationService $service;
    protected $format = 'json';

    public function __construct()
    {
        $this->service = new SmartNotificationService();
    }

    public function index()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        return $this->respond(['success' => true, 'data' => $this->service->list($orgId)]);
    }

    public function templates()
    {
        return $this->respond(['success' => true, 'data' => $this->service->getTemplates()]);
    }

    public function create()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$orgId || !$userId) {
            return $this->fail('Unauthorized', 401);
        }

        try {
            $data = $this->request->getJSON(true) ?? [];
            $rule = $this->service->create($orgId, $userId, $data);
            return $this->respond(['success' => true, 'data' => $rule], 201);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function update($id = null)
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        try {
            $data = $this->request->getJSON(true) ?? [];
            $rule = $this->service->update((int) $id, $orgId, $data);
            return $this->respond(['success' => true, 'data' => $rule]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function delete($id = null)
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        try {
            $this->service->delete((int) $id, $orgId);
            return $this->respond(['success' => true, 'message' => 'Rule deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
