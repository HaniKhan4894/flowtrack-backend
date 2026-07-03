<?php

namespace App\Controllers\API\V1;

use App\Models\ProjectModel;
use App\Services\TimeEntryService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 10 — FlowTrack Public API.
 *
 * Authenticated with an API key (see ApiKeyFilter). Read-only endpoints that
 * let external systems pull an organization's projects and tracked time.
 */
class PublicApiController extends ResourceController
{
    protected $format = 'json';

    /** GET /api/v1/public/ping */
    public function ping()
    {
        return $this->respond([
            'success' => true,
            'data' => [
                'organization_id' => $this->orgId(),
                'time'            => gmdate('c'),
                'version'         => 'v1',
            ],
        ]);
    }

    /** GET /api/v1/public/projects */
    public function projects()
    {
        try {
            $rows = (new ProjectModel())
                ->where('organization_id', $this->orgId())
                ->orderBy('name', 'ASC')
                ->findAll(200);

            $data = array_map(fn ($p) => [
                'id'          => (int) $p['id'],
                'name'        => $p['name'],
                'is_active'   => (bool) ($p['is_active'] ?? true),
                'description' => $p['description'] ?? null,
            ], $rows);

            return $this->respond(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/public/time-entries?start_date=&end_date=&project_id=&page=&per_page=
     */
    public function timeEntries()
    {
        try {
            $filters = [
                'organization_id' => $this->orgId(),
                'page'            => (int) ($this->request->getGet('page') ?? 1),
                'per_page'        => min(100, (int) ($this->request->getGet('per_page') ?? 25)),
            ];
            foreach (['start_date', 'end_date', 'project_id', 'user_id'] as $key) {
                $val = $this->request->getGet($key);
                if ($val !== null && $val !== '') {
                    $filters[$key] = $val;
                }
            }

            $result = (new TimeEntryService())->getTimeEntries($filters);
            return $this->respond(['success' => true, 'data' => $result['data'], 'pagination' => $result['pagination']]);
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
}
