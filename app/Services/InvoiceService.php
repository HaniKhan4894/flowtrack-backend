<?php

namespace App\Services;

use App\Models\InvoiceModel;
use App\Models\InvoiceItemModel;
use App\Models\TimeEntryModel;
use App\Models\ProjectModel;
use Dompdf\Dompdf;
use Dompdf\Options;

class InvoiceService
{
    protected $invoiceModel;
    protected $invoiceItemModel;
    protected $timeEntryModel;
    protected $projectModel;
    protected $notificationService;
    protected $emailService;
    protected $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->invoiceModel = new InvoiceModel();
        $this->invoiceItemModel = new InvoiceItemModel();
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->notificationService = new NotificationService();
        $this->emailService = new EmailService();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    public function createInvoice(int $organizationId, int $createdBy, array $data): array
    {
        $this->db->transStart();

        try {
            $invoiceData = [
                'organization_id' => $organizationId,
                'invoice_number' => $this->generateInvoiceNumber(),
                'client_name' => $data['client_name'],
                'client_email' => $data['client_email'] ?? null,
                'client_id' => $data['client_id'] ?? null,
                'project_id' => $data['project_id'] ?? null,
                'status' => 'draft',
                'subtotal' => 0,
                'tax_rate' => $data['tax_rate'] ?? 0,
                'tax_amount' => 0,
                'total' => 0,
                'currency' => $data['currency'] ?? 'USD',
                'issue_date' => $data['issue_date'] ?? date('Y-m-d'),
                'due_date' => $data['due_date'],
                'notes' => $data['notes'] ?? null,
                'created_by' => $createdBy,
            ];

            $invoiceId = $this->invoiceModel->insert($invoiceData);
            if (!$invoiceId) {
                throw new \RuntimeException('Failed to create invoice: ' . json_encode($this->invoiceModel->errors()));
            }

            if (isset($data['items']) && is_array($data['items'])) {
                foreach ($data['items'] as $item) {
                    $this->addInvoiceItem((int) $invoiceId, $item);
                }
            }

            $this->recalculateInvoice((int) $invoiceId);

            $this->db->transComplete();
            if ($this->db->transStatus() === false) {
                throw new \RuntimeException('Invoice transaction failed');
            }

            $invoice = $this->getInvoiceById((int) $invoiceId);
            if ($invoice === null) {
                throw new \RuntimeException('Invoice created but could not be loaded');
            }

            $this->notificationService->notifyInvoiceCreated($createdBy, $invoice);

            return $invoice;
        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function addInvoiceItem(int $invoiceId, array $itemData): array
    {
        $quantity = (float) ($itemData['quantity'] ?? 0);
        $unitPrice = (float) ($itemData['unit_price'] ?? 0);

        $itemData['invoice_id'] = $invoiceId;
        $itemData['amount'] = $quantity * $unitPrice;

        $itemId = $this->invoiceItemModel->insert($itemData);
        $this->recalculateInvoice($invoiceId);

        return $this->invoiceItemModel->find($itemId);
    }

    public function generateFromTimeEntries(int $organizationId, int $createdBy, array $data): array
    {
        $startDate = $data['start_date'] ?? null;
        $endDate = $data['end_date'] ?? null;
        if (!$startDate || !$endDate) {
            throw new \Exception('start_date and end_date are required');
        }

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $builder = $this->timeEntryModel->builder();
        $builder->where('organization_id', $organizationId)
            ->where('is_billable', 1)
            ->where('ended_at IS NOT NULL')
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc);

        if (!empty($data['user_id'])) {
            $builder->where('user_id', (int) $data['user_id']);
        }
        if (!empty($data['project_id'])) {
            $builder->where('project_id', (int) $data['project_id']);
        }

        $entries = $builder->orderBy('started_at', 'ASC')->get()->getResultArray();
        if (empty($entries)) {
            throw new \Exception('No billable time entries found for the selected period');
        }

        $grouped = [];
        foreach ($entries as $entry) {
            $projectId = (int) ($entry['project_id'] ?? 0);
            $rate = (float) ($entry['hourly_rate'] ?? $data['default_rate'] ?? 0);
            $key = $projectId . ':' . $rate;
            if (!isset($grouped[$key])) {
                $project = $projectId ? $this->projectModel->find($projectId) : null;
                $grouped[$key] = [
                    'description' => ($project['name'] ?? 'General') . ' — tracked time',
                    'quantity' => 0,
                    'unit_price' => $rate,
                    'time_entry_ids' => [],
                ];
            }
            $hours = round(((int) ($entry['duration_seconds'] ?? 0)) / 3600, 2);
            $grouped[$key]['quantity'] += $hours;
            $grouped[$key]['time_entry_ids'][] = $entry['id'];
        }

        $items = [];
        foreach ($grouped as $group) {
            if ($group['quantity'] <= 0) {
                continue;
            }
            $items[] = [
                'description' => $group['description'],
                'quantity' => round($group['quantity'], 2),
                'unit_price' => $group['unit_price'],
            ];
        }

        $clientName = $data['client_name'] ?? 'Client';
        if (!empty($data['project_id'])) {
            $project = $this->projectModel->find((int) $data['project_id']);
            if ($project && !empty($project['client_name'])) {
                $clientName = $project['client_name'];
            }
        }

        return $this->createInvoice($organizationId, $createdBy, [
            'client_name' => $clientName,
            'client_email' => $data['client_email'] ?? null,
            'project_id' => $data['project_id'] ?? null,
            'tax_rate' => $data['tax_rate'] ?? 0,
            'currency' => $data['currency'] ?? 'USD',
            'issue_date' => $data['issue_date'] ?? date('Y-m-d'),
            'due_date' => $data['due_date'] ?? date('Y-m-d', strtotime('+30 days')),
            'notes' => $data['notes'] ?? null,
            'items' => $items,
        ]);
    }

    public function sendInvoice(int $invoiceId, int $organizationId, int $sentBy): array
    {
        $invoice = $this->getInvoiceById($invoiceId);
        if (!$invoice || (int) $invoice['organization_id'] !== $organizationId) {
            throw new \Exception('Invoice not found');
        }

        if (empty($invoice['client_email'])) {
            throw new \Exception('Client email is required to send invoice');
        }

        $pdf = $this->generatePdf($invoiceId);
        $pdfPath = WRITEPATH . 'uploads/invoices/invoice-' . $invoiceId . '.pdf';
        $dir = dirname($pdfPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($pdfPath, $pdf);

        $this->emailService->sendInvoiceEmail($invoice, $invoice['client_email']);

        $this->invoiceModel->update($invoiceId, ['status' => 'sent']);
        $updated = $this->getInvoiceById($invoiceId);
        $this->notificationService->notifyInvoiceSent($sentBy, $updated);

        return $updated;
    }

    public function generatePdf(int $invoiceId): string
    {
        $invoice = $this->getInvoiceById($invoiceId);
        if (!$invoice) {
            throw new \Exception('Invoice not found');
        }

        $itemsHtml = '';
        foreach ($invoice['items'] ?? [] as $item) {
            $itemsHtml .= '<tr>'
                . '<td>' . htmlspecialchars((string) $item['description']) . '</td>'
                . '<td style="text-align:right;">' . number_format((float) $item['quantity'], 2) . '</td>'
                . '<td style="text-align:right;">' . number_format((float) $item['unit_price'], 2) . '</td>'
                . '<td style="text-align:right;">' . number_format((float) $item['amount'], 2) . '</td>'
                . '</tr>';
        }

        $html = '
            <html><body style="font-family:Arial,sans-serif;color:#111;">
            <h1>Invoice #' . htmlspecialchars((string) $invoice['invoice_number']) . '</h1>
            <p><strong>Client:</strong> ' . htmlspecialchars((string) $invoice['client_name']) . '</p>
            <p><strong>Issue date:</strong> ' . htmlspecialchars((string) $invoice['issue_date']) . '</p>
            <p><strong>Due date:</strong> ' . htmlspecialchars((string) $invoice['due_date']) . '</p>
            <table width="100%" cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;margin-top:20px;">
                <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>' . $itemsHtml . '</tbody>
            </table>
            <p style="text-align:right;margin-top:16px;"><strong>Subtotal:</strong> '
            . htmlspecialchars((string) $invoice['currency']) . ' ' . number_format((float) $invoice['subtotal'], 2) . '</p>
            <p style="text-align:right;"><strong>Tax:</strong> '
            . htmlspecialchars((string) $invoice['currency']) . ' ' . number_format((float) $invoice['tax_amount'], 2) . '</p>
            <p style="text-align:right;font-size:18px;"><strong>Total:</strong> '
            . htmlspecialchars((string) $invoice['currency']) . ' ' . number_format((float) $invoice['total'], 2) . '</p>
            </body></html>';

        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    private function recalculateInvoice(int $invoiceId): void
    {
        $items = $this->invoiceItemModel->where('invoice_id', $invoiceId)->findAll();

        $subtotal = array_sum(array_map(fn ($item) => (float) $item['amount'], $items));

        $invoice = $this->invoiceModel->find($invoiceId);
        $taxRate = (float) ($invoice['tax_rate'] ?? 0);
        $taxAmount = ($subtotal * $taxRate) / 100;
        $total = $subtotal + $taxAmount;

        $this->invoiceModel->update($invoiceId, [
            'subtotal' => round($subtotal, 2),
            'tax_amount' => round($taxAmount, 2),
            'total' => round($total, 2),
        ]);
    }

    public function getInvoiceById(int $id): ?array
    {
        $invoice = $this->invoiceModel->find($id);

        if ($invoice) {
            $invoice['items'] = $this->invoiceItemModel->where('invoice_id', $id)->findAll();
        }

        return $invoice;
    }

    public function updateInvoiceStatus(int $id, string $status): bool
    {
        $updateData = ['status' => $status];

        if ($status === 'paid') {
            $updateData['paid_at'] = date('Y-m-d H:i:s');
        }

        return $this->invoiceModel->update($id, $updateData);
    }

    public function getInvoices(array $filters): array
    {
        $builder = $this->invoiceModel->builder();

        if (isset($filters['organization_id'])) {
            $builder->where('organization_id', $filters['organization_id']);
        }

        if (isset($filters['status'])) {
            $builder->where('status', $filters['status']);
        }

        if (isset($filters['project_id'])) {
            $builder->where('project_id', $filters['project_id']);
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $invoices = $builder->orderBy('created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $invoices,
            'pagination' => [
                'current_page' => (int) $page,
                'per_page' => (int) $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage),
            ],
        ];
    }

    private function generateInvoiceNumber(): string
    {
        return 'INV-' . date('Ymd-His') . '-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }
}
