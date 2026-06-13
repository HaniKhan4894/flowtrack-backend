<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\PayrollService;

class PayrollController extends ResourceController
{
    protected PayrollService $payrollService;
    protected $format = 'json';

    public function __construct()
    {
        $this->payrollService = new PayrollService();
    }

    /**
     * GET /api/v1/payroll/summary
     */
    public function summary()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->payrollService->getSummary($organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/payroll/compensations
     */
    public function compensations()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->payrollService->getCompensations($organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/payroll/compensations
     */
    public function upsertCompensation()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$organizationId || !$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            if (empty($data['user_id'])) {
                return $this->fail('user_id is required', 400);
            }

            $comp = $this->payrollService->upsertCompensation(
                $organizationId,
                (int) $data['user_id'],
                $data,
                $userId
            );

            return $this->respond([
                'success' => true,
                'message' => 'Compensation saved',
                'data' => $comp,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/payroll/runs
     */
    public function runs()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            $page = (int)($this->request->getGet('page') ?? 1);
            $perPage = (int)($this->request->getGet('per_page') ?? 20);

            $result = $this->payrollService->getRuns($organizationId, $page, $perPage);

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
     * POST /api/v1/payroll/runs
     */
    public function createRun()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$organizationId || !$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            $run = $this->payrollService->createRun($organizationId, $data, $userId);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Payroll run created',
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/payroll/runs/{id}
     */
    public function showRun($id = null)
    {
        try {
            $run = $this->payrollService->getRun((int) $id);

            return $this->respond([
                'success' => true,
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/payroll/runs/{id}/finalize
     */
    public function finalizeRun($id = null)
    {
        try {
            $run = $this->payrollService->finalizeRun((int) $id);

            return $this->respond([
                'success' => true,
                'message' => 'Payroll run finalized',
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/payroll/items/{id}
     */
    public function updateItem($id = null)
    {
        try {
            $data = $this->request->getJSON(true);
            $run = $this->payrollService->updateItem((int) $id, $data);

            return $this->respond([
                'success' => true,
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/payroll/items/{id}/adjustments
     */
    public function addAdjustment($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true);

            if (empty($data['type']) || empty($data['label']) || !isset($data['amount'])) {
                return $this->fail('type, label, and amount are required', 400);
            }

            $run = $this->payrollService->addAdjustment(
                (int) $id,
                $data['type'],
                $data['label'],
                (float) $data['amount'],
                $userId
            );

            return $this->respond([
                'success' => true,
                'message' => 'Adjustment added',
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/payroll/items/{id}/payments
     */
    public function recordPayment($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true);

            if (!isset($data['amount'])) {
                return $this->fail('amount is required', 400);
            }

            $run = $this->payrollService->recordPayment(
                (int) $id,
                (float) $data['amount'],
                $data['method'] ?? 'manual',
                $data['reference'] ?? null,
                $userId
            );

            return $this->respond([
                'success' => true,
                'message' => 'Payment recorded',
                'data' => $run,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/payroll/runs/{id}/export
     */
    public function exportRun($id = null)
    {
        try {
            $filepath = $this->payrollService->exportRunCsv((int) $id);
            $filename = basename($filepath);

            return $this->response
                ->download($filepath, null)
                ->setFileName($filename);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/payroll/items/{id}/payslip
     */
    public function payslip($id = null)
    {
        try {
            $filepath = $this->payrollService->generatePayslipPdf((int) $id);
            $filename = basename($filepath);

            return $this->response
                ->download($filepath, null)
                ->setFileName($filename);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
