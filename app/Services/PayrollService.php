<?php

namespace App\Services;

use App\Models\OrganizationModel;
use App\Models\PayrollAdjustmentModel;
use App\Models\PayrollCompensationModel;
use App\Models\PayrollItemModel;
use App\Models\PayrollPaymentModel;
use App\Models\PayrollRunModel;

class PayrollService
{
    protected PayrollCompensationModel $compensationModel;
    protected PayrollRunModel $runModel;
    protected PayrollItemModel $itemModel;
    protected PayrollAdjustmentModel $adjustmentModel;
    protected PayrollPaymentModel $paymentModel;
    protected TimezoneService $timezoneService;
    protected NotificationService $notificationService;
    protected PermissionService $permissionService;
    protected $db;

    public function __construct()
    {
        $this->compensationModel = new PayrollCompensationModel();
        $this->runModel = new PayrollRunModel();
        $this->itemModel = new PayrollItemModel();
        $this->adjustmentModel = new PayrollAdjustmentModel();
        $this->paymentModel = new PayrollPaymentModel();
        $this->timezoneService = new TimezoneService();
        $this->notificationService = new NotificationService();
        $this->permissionService = new PermissionService();
        $this->db = \Config\Database::connect();
    }

    public function getOrgCurrency(int $organizationId): string
    {
        $org = (new OrganizationModel())->select('currency')->find($organizationId);
        return strtoupper(trim((string) ($org['currency'] ?? 'USD'))) ?: 'USD';
    }

    public function getCompensations(int $organizationId): array
    {
        $rows = $this->db->table('payroll_compensations pc')
            ->select('pc.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = pc.user_id')
            ->where('pc.organization_id', $organizationId)
            ->where('pc.is_active', 1)
            ->orderBy('users.first_name', 'ASC')
            ->get()
            ->getResultArray();

        return array_map(fn ($r) => $this->formatCompensation($r), $rows);
    }

    public function upsertCompensation(int $organizationId, int $userId, array $data, int $createdBy): array
    {
        $currency = $data['currency'] ?? $this->getOrgCurrency($organizationId);
        $payload = [
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'pay_type' => $data['pay_type'] ?? 'hourly',
            'hourly_rate' => isset($data['hourly_rate']) ? (float) $data['hourly_rate'] : null,
            'fixed_amount' => isset($data['fixed_amount']) ? (float) $data['fixed_amount'] : null,
            'currency' => $currency,
            'is_active' => 1,
            'notes' => $data['notes'] ?? null,
            'created_by' => $createdBy,
        ];

        $existing = $this->compensationModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('is_active', 1)
            ->first();

        if ($existing) {
            unset($payload['created_by']);
            $this->compensationModel->update($existing['id'], $payload);
            $id = (int) $existing['id'];
        } else {
            $this->compensationModel->insert($payload);
            $id = (int) $this->compensationModel->getInsertID();
        }

        return $this->getCompensationById($id);
    }

    public function getCompensationById(int $id): array
    {
        $row = $this->db->table('payroll_compensations pc')
            ->select('pc.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = pc.user_id')
            ->where('pc.id', $id)
            ->get()
            ->getRowArray();

        if (!$row) {
            throw new \Exception('Compensation not found');
        }

        return $this->formatCompensation($row);
    }

    public function getRuns(int $organizationId, int $page = 1, int $perPage = 20): array
    {
        $offset = ($page - 1) * $perPage;
        $total = $this->runModel->where('organization_id', $organizationId)->countAllResults(false);
        $rows = $this->runModel
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->findAll($perPage, $offset);

        return [
            'data' => array_map(fn ($r) => $this->formatRun($r), $rows),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function createRun(int $organizationId, array $data, int $createdBy): array
    {
        $periodStart = $data['period_start'] ?? '';
        $periodEnd = $data['period_end'] ?? '';
        if (!$periodStart || !$periodEnd) {
            throw new \Exception('period_start and period_end are required');
        }

        $currency = $data['currency'] ?? $this->getOrgCurrency($organizationId);
        $title = $data['title'] ?? ('Payroll ' . $periodStart . ' to ' . $periodEnd);

        $this->runModel->insert([
            'organization_id' => $organizationId,
            'title' => $title,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'status' => 'draft',
            'currency' => $currency,
            'total_gross' => 0,
            'total_paid' => 0,
            'created_by' => $createdBy,
        ]);

        $runId = (int) $this->runModel->getInsertID();
        $this->generateItems($runId);

        return $this->getRun($runId);
    }

    public function generateItems(int $runId): void
    {
        $run = $this->runModel->find($runId);
        if (!$run) {
            throw new \Exception('Payroll run not found');
        }

        $orgId = (int) $run['organization_id'];
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($run['period_start'], $run['period_end'], $phpTz);

        $members = $this->db->table('organization_members om')
            ->select('om.user_id, om.hourly_rate as member_rate, users.first_name, users.last_name')
            ->join('users', 'users.id = om.user_id')
            ->where('om.organization_id', $orgId)
            ->get()
            ->getResultArray();

        $this->itemModel->where('payroll_run_id', $runId)->delete();

        foreach ($members as $member) {
            $userId = (int) $member['user_id'];
            $comp = $this->compensationModel
                ->where('organization_id', $orgId)
                ->where('user_id', $userId)
                ->where('is_active', 1)
                ->first();

            $payType = $comp['pay_type'] ?? 'hourly';
            $hourlyRate = $comp['hourly_rate'] ?? $member['member_rate'] ?? null;
            $fixedAmount = $comp['fixed_amount'] ?? null;

            $tracked = $this->db->table('time_entries te')
                ->select('COALESCE(SUM(te.duration_seconds), 0) as total_seconds', false)
                ->join('timesheet_entries tse', 'tse.time_entry_id = te.id')
                ->join('timesheet_periods tp', 'tp.id = tse.period_id')
                ->where('te.organization_id', $orgId)
                ->where('te.user_id', $userId)
                ->where('tp.status', 'approved')
                ->where('te.started_at >=', $startUtc)
                ->where('te.started_at <=', $endUtc)
                ->get()
                ->getRowArray();

            $trackedSeconds = (int) ($tracked['total_seconds'] ?? 0);
            $hours = $trackedSeconds / 3600;

            $baseAmount = match ($payType) {
                'hourly' => round($hours * (float) ($hourlyRate ?? 0), 2),
                'fixed' => round((float) ($fixedAmount ?? 0), 2),
                'custom' => 0,
                default => 0,
            };

            $this->itemModel->insert([
                'payroll_run_id' => $runId,
                'organization_id' => $orgId,
                'user_id' => $userId,
                'pay_type' => $payType,
                'tracked_seconds' => $trackedSeconds,
                'hourly_rate' => $hourlyRate,
                'base_amount' => $baseAmount,
                'bonus_total' => 0,
                'deduction_total' => 0,
                'gross_amount' => $baseAmount,
                'paid_amount' => 0,
                'status' => 'pending',
            ]);
        }

        $this->recalculateRunTotals($runId);
    }

    public function getRun(int $runId): array
    {
        $run = $this->runModel->find($runId);
        if (!$run) {
            throw new \Exception('Payroll run not found');
        }

        $items = $this->db->table('payroll_items pi')
            ->select('pi.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = pi.user_id')
            ->where('pi.payroll_run_id', $runId)
            ->orderBy('users.first_name', 'ASC')
            ->get()
            ->getResultArray();

        $formattedItems = [];
        foreach ($items as $item) {
            $itemId = (int) $item['id'];
            $adjustments = $this->adjustmentModel->where('payroll_item_id', $itemId)->findAll();
            $payments = $this->paymentModel->where('payroll_item_id', $itemId)->orderBy('paid_at', 'DESC')->findAll();
            $formattedItems[] = $this->formatItem($item, $adjustments, $payments);
        }

        $formatted = $this->formatRun($run);
        $formatted['items'] = $formattedItems;

        return $formatted;
    }

    public function updateItem(int $itemId, array $data): array
    {
        $item = $this->itemModel->find($itemId);
        if (!$item) {
            throw new \Exception('Payroll item not found');
        }

        $run = $this->runModel->find($item['payroll_run_id']);
        if ($run['status'] !== 'draft') {
            throw new \Exception('Cannot edit items on a finalized payroll run');
        }

        $updates = [];
        if (isset($data['base_amount'])) {
            $updates['base_amount'] = (float) $data['base_amount'];
        }
        if (isset($data['notes'])) {
            $updates['notes'] = $data['notes'];
        }
        if (isset($data['pay_type'])) {
            $updates['pay_type'] = $data['pay_type'];
        }
        if (isset($data['hourly_rate'])) {
            $updates['hourly_rate'] = (float) $data['hourly_rate'];
        }

        if (!empty($updates)) {
            $this->itemModel->update($itemId, $updates);
            $this->recalculateItemGross($itemId);
        }

        return $this->getRun((int) $item['payroll_run_id']);
    }

    public function addAdjustment(int $itemId, string $type, string $label, float $amount, int $createdBy): array
    {
        $item = $this->itemModel->find($itemId);
        if (!$item) {
            throw new \Exception('Payroll item not found');
        }

        if (!in_array($type, ['bonus', 'deduction'], true)) {
            throw new \Exception('Invalid adjustment type');
        }

        $this->adjustmentModel->insert([
            'payroll_item_id' => $itemId,
            'type' => $type,
            'label' => $label,
            'amount' => abs($amount),
            'created_by' => $createdBy,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $this->recalculateItemGross($itemId);

        return $this->getRun((int) $item['payroll_run_id']);
    }

    public function recordPayment(int $itemId, float $amount, string $method, ?string $reference, int $recordedBy): array
    {
        $item = $this->itemModel->find($itemId);
        if (!$item) {
            throw new \Exception('Payroll item not found');
        }

        if ($amount <= 0) {
            throw new \Exception('Payment amount must be greater than zero');
        }

        $this->paymentModel->insert([
            'payroll_item_id' => $itemId,
            'organization_id' => (int) $item['organization_id'],
            'amount' => $amount,
            'method' => $method ?: 'manual',
            'reference' => $reference,
            'status' => 'completed',
            'paid_at' => date('Y-m-d H:i:s'),
            'recorded_by' => $recordedBy,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $newPaid = (float) $item['paid_amount'] + $amount;
        $gross = (float) $item['gross_amount'];
        $status = $newPaid >= $gross ? 'paid' : ($newPaid > 0 ? 'partial' : 'pending');

        $this->itemModel->update($itemId, [
            'paid_amount' => $newPaid,
            'status' => $status,
        ]);

        $this->recalculateRunTotals((int) $item['payroll_run_id']);

        return $this->getRun((int) $item['payroll_run_id']);
    }

    public function finalizeRun(int $runId): array
    {
        $run = $this->runModel->find($runId);
        if (!$run) {
            throw new \Exception('Payroll run not found');
        }

        if ($run['status'] !== 'draft') {
            throw new \Exception('Payroll run is already finalized');
        }

        $this->runModel->update($runId, [
            'status' => 'finalized',
            'finalized_at' => date('Y-m-d H:i:s'),
        ]);

        $this->recalculateRunTotals($runId);

        $run = $this->getRun($runId);
        $this->notifyPayrollViewers((int) $run['organization_id'], $run);

        return $run;
    }

    private function notifyPayrollViewers(int $organizationId, array $run): void
    {
        $members = $this->db->table('organization_members')
            ->select('user_id')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();

        foreach ($members as $member) {
            $userId = (int) $member['user_id'];
            if ($this->permissionService->userHasPermission($userId, $organizationId, 'payroll.view')
                || $this->permissionService->userHasPermission($userId, $organizationId, 'payroll.manage')) {
                $this->notificationService->notifyPayrollFinalized($userId, $run);
            }
        }
    }

    public function getSummary(int $organizationId): array
    {
        $runs = $this->runModel->where('organization_id', $organizationId)->findAll();
        $totalGross = 0;
        $totalPaid = 0;

        foreach ($runs as $run) {
            $totalGross += (float) $run['total_gross'];
            $totalPaid += (float) $run['total_paid'];
        }

        $compCount = $this->compensationModel
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->countAllResults();

        return [
            'total_gross' => round($totalGross, 2),
            'total_paid' => round($totalPaid, 2),
            'total_pending' => round($totalGross - $totalPaid, 2),
            'runs_count' => count($runs),
            'members_with_compensation' => $compCount,
        ];
    }

    private function recalculateItemGross(int $itemId): void
    {
        $item = $this->itemModel->find($itemId);
        if (!$item) {
            return;
        }

        $adjustments = $this->adjustmentModel->where('payroll_item_id', $itemId)->findAll();
        $bonus = 0;
        $deduction = 0;
        foreach ($adjustments as $adj) {
            if ($adj['type'] === 'bonus') {
                $bonus += (float) $adj['amount'];
            } else {
                $deduction += (float) $adj['amount'];
            }
        }

        $gross = max(0, (float) $item['base_amount'] + $bonus - $deduction);

        $this->itemModel->update($itemId, [
            'bonus_total' => $bonus,
            'deduction_total' => $deduction,
            'gross_amount' => $gross,
        ]);

        $this->recalculateRunTotals((int) $item['payroll_run_id']);
    }

    private function recalculateRunTotals(int $runId): void
    {
        $items = $this->itemModel->where('payroll_run_id', $runId)->findAll();
        $totalGross = 0;
        $totalPaid = 0;
        $allPaid = true;
        $anyPaid = false;

        foreach ($items as $item) {
            $totalGross += (float) $item['gross_amount'];
            $totalPaid += (float) $item['paid_amount'];
            if ($item['status'] !== 'paid') {
                $allPaid = false;
            }
            if ((float) $item['paid_amount'] > 0) {
                $anyPaid = true;
            }
        }

        $run = $this->runModel->find($runId);
        $status = $run['status'];
        if ($status !== 'draft') {
            if ($allPaid && $totalGross > 0) {
                $status = 'paid';
            } elseif ($anyPaid) {
                $status = 'partially_paid';
            } elseif ($status === 'partially_paid') {
                $status = 'finalized';
            }
        }

        $this->runModel->update($runId, [
            'total_gross' => round($totalGross, 2),
            'total_paid' => round($totalPaid, 2),
            'status' => $status,
        ]);
    }

    private function formatCompensation(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'user_id' => (int) $row['user_id'],
            'pay_type' => $row['pay_type'],
            'hourly_rate' => $row['hourly_rate'] !== null ? (float) $row['hourly_rate'] : null,
            'fixed_amount' => $row['fixed_amount'] !== null ? (float) $row['fixed_amount'] : null,
            'currency' => $row['currency'] ?? 'USD',
            'is_active' => (bool) $row['is_active'],
            'notes' => $row['notes'] ?? null,
            'first_name' => $row['first_name'] ?? null,
            'last_name' => $row['last_name'] ?? null,
            'email' => $row['email'] ?? null,
        ];
    }

    private function formatRun(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'title' => $row['title'],
            'period_start' => $row['period_start'],
            'period_end' => $row['period_end'],
            'status' => $row['status'],
            'currency' => $row['currency'] ?? 'USD',
            'total_gross' => (float) ($row['total_gross'] ?? 0),
            'total_paid' => (float) ($row['total_paid'] ?? 0),
            'created_by' => isset($row['created_by']) ? (int) $row['created_by'] : null,
            'finalized_at' => $row['finalized_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
        ];
    }

    private function formatItem(array $row, array $adjustments = [], array $payments = []): array
    {
        return [
            'id' => (int) $row['id'],
            'payroll_run_id' => (int) $row['payroll_run_id'],
            'organization_id' => (int) $row['organization_id'],
            'user_id' => (int) $row['user_id'],
            'pay_type' => $row['pay_type'],
            'tracked_seconds' => (int) ($row['tracked_seconds'] ?? 0),
            'hourly_rate' => $row['hourly_rate'] !== null ? (float) $row['hourly_rate'] : null,
            'base_amount' => (float) ($row['base_amount'] ?? 0),
            'bonus_total' => (float) ($row['bonus_total'] ?? 0),
            'deduction_total' => (float) ($row['deduction_total'] ?? 0),
            'gross_amount' => (float) ($row['gross_amount'] ?? 0),
            'paid_amount' => (float) ($row['paid_amount'] ?? 0),
            'status' => $row['status'] ?? 'pending',
            'notes' => $row['notes'] ?? null,
            'first_name' => $row['first_name'] ?? null,
            'last_name' => $row['last_name'] ?? null,
            'email' => $row['email'] ?? null,
            'adjustments' => array_map(fn ($a) => [
                'id' => (int) $a['id'],
                'payroll_item_id' => (int) $a['payroll_item_id'],
                'type' => $a['type'],
                'label' => $a['label'],
                'amount' => (float) $a['amount'],
                'created_at' => $a['created_at'] ?? null,
            ], $adjustments),
            'payments' => array_map(fn ($p) => [
                'id' => (int) $p['id'],
                'payroll_item_id' => (int) $p['payroll_item_id'],
                'amount' => (float) $p['amount'],
                'method' => $p['method'],
                'reference' => $p['reference'] ?? null,
                'status' => $p['status'],
                'paid_at' => $p['paid_at'],
            ], $payments),
        ];
    }

    public function exportRunCsv(int $runId): string
    {
        $run = $this->getRun($runId);
        $filename = 'payroll_run_' . $runId . '_' . date('Y-m-d') . '.csv';
        $filepath = WRITEPATH . 'exports/' . $filename;

        if (!is_dir(WRITEPATH . 'exports')) {
            mkdir(WRITEPATH . 'exports', 0755, true);
        }

        $file = fopen($filepath, 'w');
        fputcsv($file, ['Employee', 'Email', 'Pay Type', 'Tracked Hours', 'Base', 'Bonus', 'Deductions', 'Gross', 'Paid', 'Status']);

        foreach ($run['items'] as $item) {
            fputcsv($file, [
                trim(($item['first_name'] ?? '') . ' ' . ($item['last_name'] ?? '')),
                $item['email'] ?? '',
                $item['pay_type'],
                round(($item['tracked_seconds'] ?? 0) / 3600, 2),
                $item['base_amount'],
                $item['bonus_total'],
                $item['deduction_total'],
                $item['gross_amount'],
                $item['paid_amount'],
                $item['status'],
            ]);
        }

        fclose($file);

        return $filepath;
    }

    public function generatePayslipPdf(int $itemId): string
    {
        $item = $this->itemModel->find($itemId);
        if (!$item) {
            throw new \Exception('Payroll item not found');
        }

        $run = $this->runModel->find($item['payroll_run_id']);
        $user = $this->db->table('users')->where('id', $item['user_id'])->get()->getRowArray();
        $org = (new OrganizationModel())->find($item['organization_id']);
        $adjustments = $this->adjustmentModel->where('payroll_item_id', $itemId)->findAll();

        $filename = 'payslip_' . $itemId . '_' . date('Y-m-d') . '.pdf';
        $filepath = WRITEPATH . 'exports/' . $filename;

        if (!is_dir(WRITEPATH . 'exports')) {
            mkdir(WRITEPATH . 'exports', 0755, true);
        }

        $employeeName = htmlspecialchars(trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')));
        $orgName = htmlspecialchars($org['name'] ?? 'Organization');

        $html = '<html><head><style>
            body { font-family: DejaVu Sans, sans-serif; font-size: 12px; }
            h1 { font-size: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        </style></head><body>';
        $html .= '<h1>Payslip</h1>';
        $html .= '<p><strong>Organization:</strong> ' . $orgName . '</p>';
        $html .= '<p><strong>Employee:</strong> ' . $employeeName . '</p>';
        $html .= '<p><strong>Period:</strong> ' . htmlspecialchars($run['period_start'] . ' to ' . $run['period_end']) . '</p>';
        $html .= '<table><tr><th>Description</th><th>Amount</th></tr>';
        $html .= '<tr><td>Base Pay</td><td>' . number_format((float) $item['base_amount'], 2) . ' ' . ($run['currency'] ?? 'USD') . '</td></tr>';

        foreach ($adjustments as $adj) {
            $sign = $adj['type'] === 'deduction' ? '-' : '+';
            $html .= '<tr><td>' . htmlspecialchars($adj['label']) . '</td><td>' . $sign . number_format((float) $adj['amount'], 2) . '</td></tr>';
        }

        $html .= '<tr><td><strong>Gross Total</strong></td><td><strong>' . number_format((float) $item['gross_amount'], 2) . '</strong></td></tr>';
        $html .= '<tr><td>Paid</td><td>' . number_format((float) $item['paid_amount'], 2) . '</td></tr>';
        $html .= '</table></body></html>';

        $dompdf = new \Dompdf\Dompdf();
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4');
        $dompdf->render();
        file_put_contents($filepath, $dompdf->output());

        return $filepath;
    }
}
