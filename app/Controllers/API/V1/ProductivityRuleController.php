<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ProductivityRuleService;

class ProductivityRuleController extends ResourceController
{
    protected ProductivityRuleService $ruleService;
    protected $format = 'json';

    public function __construct()
    {
        $this->ruleService = new ProductivityRuleService();
    }

    private function requireOrganizationId()
    {
        $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }

        return $organizationId;
    }

    /**
     * GET /api/v1/productivity-rules
     */
    public function index()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $filters = [
                'is_active' => $this->request->getGet('is_active'),
                'rule_type' => $this->request->getGet('rule_type'),
                'search' => $this->request->getGet('search'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 50,
            ];
            $filters = array_filter($filters, fn ($v) => $v !== null);

            $result = $this->ruleService->getRules($organizationId, $filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination'],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/productivity-rules
     */
    public function create()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $createdBy = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true);

            $rules = [
                'rule_type' => 'required|in_list[app,url,keyword]',
                'pattern' => 'required|max_length[500]',
                'category' => 'required|in_list[productive,unproductive,neutral]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $rule = $this->ruleService->createRule($organizationId, $createdBy, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Productivity rule created successfully',
                'data' => $rule,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/productivity-rules/{id}
     */
    public function update($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            $updated = $this->ruleService->updateRule((int) $id, $organizationId, $data);

            if (!$updated) {
                return $this->fail('Failed to update productivity rule', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Productivity rule updated successfully',
                'data' => $this->ruleService->getRuleById((int) $id, $organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/productivity-rules/{id}
     */
    public function delete($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $deleted = $this->ruleService->deleteRule((int) $id, $organizationId);

            if (!$deleted) {
                return $this->fail('Failed to delete productivity rule', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Productivity rule deleted successfully',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
