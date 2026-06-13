<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\AuditService;

class AuditController extends ResourceController
{
    protected AuditService $auditService;
    protected $format = 'json';

    public function __construct()
    {
        $this->auditService = new AuditService();
    }

    public function index()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context is required', 400);
            }

            $filters = array_filter([
                'user_id' => $this->request->getGet('user_id'),
                'action' => $this->request->getGet('action'),
                'entity_type' => $this->request->getGet('entity_type'),
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 50,
            ], fn ($v) => $v !== null && $v !== '');

            $result = $this->auditService->getLogs($organizationId, $filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination'],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function show($id = null)
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context is required', 400);
            }

            $log = $this->auditService->getLog((int) $id, $organizationId);

            return $this->respond(['success' => true, 'data' => $log]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
