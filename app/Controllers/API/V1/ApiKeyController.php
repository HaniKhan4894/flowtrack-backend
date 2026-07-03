<?php

namespace App\Controllers\API\V1;

use App\Services\ApiKeyService;
use CodeIgniter\RESTful\ResourceController;

class ApiKeyController extends ResourceController
{
    protected $format = 'json';
    protected ApiKeyService $service;

    public function __construct()
    {
        $this->service = new ApiKeyService();
    }

    /** GET /api/v1/developer/api-keys */
    public function index()
    {
        try {
            return $this->respond(['success' => true, 'data' => $this->service->list($this->orgId())]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** POST /api/v1/developer/api-keys  { name } */
    public function create()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];
            $result = $this->service->create($orgId, $userId, (string) ($body['name'] ?? ''));
            return $this->respondCreated([
                'success' => true,
                'message' => 'API key created. Copy it now — it will not be shown again.',
                'data' => $result,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** DELETE /api/v1/developer/api-keys/(:num) */
    public function delete($id = null)
    {
        try {
            $this->service->revoke($this->orgId(), (int) $id);
            return $this->respond(['success' => true, 'message' => 'API key revoked']);
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
