<?php

namespace App\Controllers\API\V1;

use App\Services\ClientPortalService;
use CodeIgniter\RESTful\ResourceController;

class ClientPortalController extends ResourceController
{
    protected ClientPortalService $portalService;
    protected $format = 'json';

    public function __construct()
    {
        $this->portalService = new ClientPortalService();
    }

    public function show(string $token)
    {
        $invoice = $this->portalService->getInvoiceForPortal($token);
        if (!$invoice) {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        return $this->respond(['success' => true, 'data' => $invoice]);
    }

    public function approve(string $token)
    {
        try {
            $note = $this->request->getJSON(true)['note'] ?? null;
            $invoice = $this->portalService->approveInvoice($token, $note);
            return $this->respond(['success' => true, 'data' => $invoice, 'message' => 'Invoice approved']);
        } catch (\Exception $e) {
            return $this->respond(['success' => false, 'error' => $e->getMessage()], 400);
        }
    }

    public function recordPayment(string $token)
    {
        try {
            $body = $this->request->getJSON(true) ?? [];
            $amount = (float) ($body['amount'] ?? 0);
            $method = (string) ($body['method'] ?? 'bank_transfer');
            $reference = $body['reference'] ?? null;
            $note = $body['note'] ?? null;

            $invoice = $this->portalService->recordPayment($token, $amount, $method, $reference, $note);
            return $this->respond(['success' => true, 'data' => $invoice, 'message' => 'Payment recorded']);
        } catch (\Exception $e) {
            return $this->respond(['success' => false, 'error' => $e->getMessage()], 400);
        }
    }
}
