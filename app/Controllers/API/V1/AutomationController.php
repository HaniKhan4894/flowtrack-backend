<?php

namespace App\Controllers\API\V1;

use App\Services\AutomationService;
use CodeIgniter\RESTful\ResourceController;

class AutomationController extends ResourceController
{
    protected $format = 'json';
    protected AutomationService $service;

    public function __construct()
    {
        $this->service = new AutomationService();
    }

    /** GET /api/v1/developer/automations */
    public function index()
    {
        try {
            return $this->respond([
                'success' => true,
                'data' => [
                    'automations' => $this->service->list($this->orgId()),
                    'meta'        => $this->service->metadata(),
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** POST /api/v1/developer/automations */
    public function create()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];
            return $this->respondCreated(['success' => true, 'data' => $this->service->create($orgId, $userId, $body)]);
        } catch (\InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** PUT /api/v1/developer/automations/(:num) */
    public function update($id = null)
    {
        try {
            $body = $this->request->getJSON(true) ?? [];
            return $this->respond(['success' => true, 'data' => $this->service->update((int) $id, $this->orgId(), $body)]);
        } catch (\InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** DELETE /api/v1/developer/automations/(:num) */
    public function delete($id = null)
    {
        try {
            $this->service->delete((int) $id, $this->orgId());
            return $this->respond(['success' => true, 'message' => 'Automation deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }

    private function context(): array
    {
        return [$this->orgId(), (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0)];
    }
}
