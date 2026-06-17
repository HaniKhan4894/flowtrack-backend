<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\InvoiceService;
use App\Services\ClientPortalService;

class InvoiceController extends ResourceController
{
    protected $invoiceService;
    protected $format = 'json';

    public function __construct()
    {
        $this->invoiceService = new InvoiceService();
    }

    /**
     * GET /api/v1/invoices?organization_id=1&status=draft&page=1
     */
    public function index()
    {
        try {
            $filters = [
                'organization_id' => (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0),
                'status' => $this->request->getGet('status'),
                'project_id' => $this->request->getGet('project_id'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->invoiceService->getInvoices($filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination']
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/invoices/{id}
     */
    public function show($id = null)
    {
        try {
            $invoice = $this->invoiceService->getInvoiceById($id);

            if (!$invoice) {
                return $this->failNotFound('Invoice not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $invoice
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/invoices
     */
    public function create()
    {
        try {
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $createdBy = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$organizationId || !$createdBy) {
                return $this->fail('Unauthorized', 401);
            }
            
            $data = $this->request->getJSON(true);

            $rules = [
                'client_name' => 'required',
                'due_date' => 'required|valid_date',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $invoice = $this->invoiceService->createInvoice($organizationId, $createdBy, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Invoice created successfully',
                'data' => $invoice
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/invoices/generate-from-time
     */
    public function generateFromTime()
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $createdBy = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$organizationId || !$createdBy) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true) ?? [];

            $rules = [
                'start_date' => 'required|valid_date',
                'end_date' => 'required|valid_date',
                'due_date' => 'required|valid_date',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $invoice = $this->invoiceService->generateFromTimeEntries($organizationId, $createdBy, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Invoice generated from tracked time',
                'data' => $invoice,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/invoices/{id}/populate-from-time
     */
    public function populateFromTime($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true) ?? [];

            $rules = [
                'start_date' => 'required|valid_date',
                'end_date' => 'required|valid_date',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $invoice = $this->invoiceService->populateFromTimeEntries((int) $id, $organizationId, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Invoice populated from tracked time',
                'data' => $invoice,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/invoices/{id}
     */
    public function update($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true) ?? [];
            $invoice = $this->invoiceService->updateInvoice((int) $id, $organizationId, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Invoice updated successfully',
                'data' => $invoice,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/invoices/{id}/items
     */
    public function addItem($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'description' => 'required',
                'quantity' => 'required|decimal',
                'unit_price' => 'required|decimal',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $item = $this->invoiceService->addInvoiceItem($id, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Invoice item added successfully',
                'data' => $item
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/invoices/{id}/status
     */
    public function updateStatus($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            if (!isset($data['status'])) {
                return $this->fail('Status is required', 400);
            }

            $updated = $this->invoiceService->updateInvoiceStatus($id, $data['status']);

            if (!$updated) {
                return $this->fail('Failed to update invoice status', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Invoice status updated successfully',
                'data' => $this->invoiceService->getInvoiceById($id)
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/invoices/{id}/send
     */
    public function send($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $sentBy = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$organizationId || !$sentBy) {
                return $this->fail('Unauthorized', 401);
            }

            $invoice = $this->invoiceService->sendInvoice((int) $id, $organizationId, $sentBy);

            return $this->respond([
                'success' => true,
                'message' => 'Invoice sent successfully',
                'data' => $invoice,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/invoices/{id}/pdf
     */
    public function pdf($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $invoice = $this->invoiceService->getInvoiceById((int) $id);
            if (!$invoice || (int) $invoice['organization_id'] !== $organizationId) {
                return $this->failNotFound('Invoice not found');
            }

            $pdf = $this->invoiceService->generatePdf((int) $id);

            return $this->response
                ->setHeader('Content-Type', 'application/pdf')
                ->setHeader('Content-Disposition', 'attachment; filename="invoice-' . $invoice['invoice_number'] . '.pdf"')
                ->setBody($pdf);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function portalLink($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $invoice = $this->invoiceService->getInvoiceById((int) $id);
            if (!$invoice || (int) $invoice['organization_id'] !== $organizationId) {
                return $this->failNotFound('Invoice not found');
            }

            $portalService = new ClientPortalService();
            $token = $portalService->getOrCreatePortalToken((int) $id);

            return $this->respond([
                'success' => true,
                'data' => [
                    'token' => $token,
                    'url' => $portalService->getPortalUrl($token),
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function payments($id = null)
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $invoice = $this->invoiceService->getInvoiceById((int) $id);
            if (!$invoice || (int) $invoice['organization_id'] !== $organizationId) {
                return $this->failNotFound('Invoice not found');
            }

            $portalService = new ClientPortalService();
            return $this->respond([
                'success' => true,
                'data' => $portalService->getPaymentsForInvoice((int) $id),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
