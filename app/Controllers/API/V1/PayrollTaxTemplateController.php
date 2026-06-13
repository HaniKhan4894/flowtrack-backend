<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\PayrollTaxTemplateService;

class PayrollTaxTemplateController extends ResourceController
{
    protected PayrollTaxTemplateService $templateService;
    protected $format = 'json';

    public function __construct()
    {
        $this->templateService = new PayrollTaxTemplateService();
    }

    public function index()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->templateService->list($organizationId),
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
                return $this->fail('Organization context required', 400);
            }

            $template = $this->templateService->get((int) $id, $organizationId);
            if (!$template) {
                return $this->failNotFound('Tax template not found');
            }

            return $this->respond(['success' => true, 'data' => $template]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function create()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            $data = $this->request->getJSON(true);
            $template = $this->templateService->create($organizationId, $data);

            return $this->respondCreated(['success' => true, 'data' => $template]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function update($id = null)
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            $data = $this->request->getJSON(true);
            $template = $this->templateService->update((int) $id, $organizationId, $data);

            return $this->respond(['success' => true, 'data' => $template]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function delete($id = null)
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            $this->templateService->delete((int) $id, $organizationId);

            return $this->respondDeleted(['success' => true, 'message' => 'Tax template deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
