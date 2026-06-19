<?php

namespace App\Controllers\API\V1;

use App\Services\OfficeLocationService;
use CodeIgniter\RESTful\ResourceController;

class OfficeLocationController extends ResourceController
{
    protected OfficeLocationService $service;
    protected $format = 'json';

    public function __construct()
    {
        $this->service = new OfficeLocationService();
    }

    public function index()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        $type = $this->request->getGet('type');

        return $this->respond(['success' => true, 'data' => $this->service->list($orgId, $type)]);
    }

    public function create()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        try {
            $data = $this->request->getJSON(true) ?? [];
            $location = $this->service->create($orgId, $data);
            return $this->respond(['success' => true, 'data' => $location], 201);
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
            $location = $this->service->update((int) $id, $orgId, $data);
            return $this->respond(['success' => true, 'data' => $location]);
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
            return $this->respond(['success' => true, 'message' => 'Location deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function runAutoDetect()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        $created = $this->service->runAutoDetect($orgId);

        return $this->respond(['success' => true, 'data' => ['created' => $created]]);
    }

    public function breakdown()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            return $this->fail('Unauthorized', 401);
        }

        $start = $this->request->getGet('start_date') ?? date('Y-m-d', strtotime('-30 days'));
        $end = $this->request->getGet('end_date') ?? date('Y-m-d');

        return $this->respond([
            'success' => true,
            'data' => $this->service->getLocationBreakdown($orgId, $start, $end),
        ]);
    }
}
