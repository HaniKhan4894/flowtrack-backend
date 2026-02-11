<?php

namespace App\Services;

use App\Models\InvoiceModel;
use App\Models\InvoiceItemModel;
use App\Models\TimeEntryModel;

class InvoiceService
{
    protected $invoiceModel;
    protected $invoiceItemModel;
    protected $timeEntryModel;
    protected $db;

    public function __construct()
    {
        $this->invoiceModel = new InvoiceModel();
        $this->invoiceItemModel = new InvoiceItemModel();
        $this->timeEntryModel = new TimeEntryModel();
        $this->db = \Config\Database::connect();
    }

    public function createInvoice(int $organizationId, int $createdBy, array $data): array
    {
        $this->db->transStart();

        try {
            $invoiceData = [
                'organization_id' => $organizationId,
                'client_name' => $data['client_name'],
                'client_email' => $data['client_email'] ?? null,
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
                'created_by' => $createdBy
            ];

            $invoiceId = $this->invoiceModel->insert($invoiceData);

            // Add items
            if (isset($data['items']) && is_array($data['items'])) {
                foreach ($data['items'] as $item) {
                    $this->addInvoiceItem($invoiceId, $item);
                }
            }

            // Recalculate totals
            $this->recalculateInvoice($invoiceId);

            $this->db->transComplete();

            return $this->getInvoiceById($invoiceId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function addInvoiceItem(int $invoiceId, array $itemData): array
    {
        $itemData['invoice_id'] = $invoiceId;
        
        $itemId = $this->invoiceItemModel->insert($itemData);

        return $this->invoiceItemModel->find($itemId);
    }

    private function recalculateInvoice(int $invoiceId): void
    {
        $items = $this->invoiceItemModel->where('invoice_id', $invoiceId)->findAll();
        
        $subtotal = array_sum(array_column($items, 'amount'));
        
        $invoice = $this->invoiceModel->find($invoiceId);
        $taxRate = $invoice['tax_rate'] ?? 0;
        $taxAmount = ($subtotal * $taxRate) / 100;
        $total = $subtotal + $taxAmount;

        $this->invoiceModel->update($invoiceId, [
            'subtotal' => $subtotal,
            'tax_amount' => $taxAmount,
            'total' => $total
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
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
