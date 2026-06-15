<?php

namespace App\Services;

use App\Models\InvoiceModel;

class ClientPortalService
{
    protected InvoiceModel $invoiceModel;
    protected $db;

    public function __construct()
    {
        $this->invoiceModel = new InvoiceModel();
        $this->db = \Config\Database::connect();
    }

    public function createPortalToken(int $invoiceId): string
    {
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+90 days'));

        $this->db->table('invoice_portal_tokens')->insert([
            'invoice_id' => $invoiceId,
            'token' => $token,
            'expires_at' => $expiresAt,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return $token;
    }

    public function getPortalUrl(string $token): string
    {
        $base = rtrim((string) env('app.frontendURL', 'http://localhost:5173'), '/');
        return $base . '/portal/' . $token;
    }

    public function resolveToken(string $token): ?array
    {
        $row = $this->db->table('invoice_portal_tokens')
            ->where('token', $token)
            ->get()
            ->getRowArray();

        if (!$row) {
            return null;
        }

        if (!empty($row['expires_at']) && strtotime($row['expires_at']) < time()) {
            return null;
        }

        return $row;
    }

    public function getInvoiceForPortal(string $token): ?array
    {
        $portal = $this->resolveToken($token);
        if (!$portal) {
            return null;
        }

        $invoice = (new InvoiceService())->getInvoiceById((int) $portal['invoice_id']);
        if (!$invoice) {
            return null;
        }

        $payments = $this->db->table('invoice_payments')
            ->where('invoice_id', $invoice['id'])
            ->orderBy('paid_at', 'DESC')
            ->get()
            ->getResultArray();

        $invoice['payments'] = $payments;
        $invoice['portal_url'] = $this->getPortalUrl($token);
        $invoice['amount_paid'] = (float) ($invoice['amount_paid'] ?? 0);
        $invoice['balance_due'] = max(0, (float) $invoice['total'] - (float) $invoice['amount_paid']);

        return $invoice;
    }

    public function approveInvoice(string $token, ?string $note = null): array
    {
        $portal = $this->resolveToken($token);
        if (!$portal) {
            throw new \Exception('Invalid or expired portal link');
        }

        $invoiceId = (int) $portal['invoice_id'];
        $invoice = $this->invoiceModel->find($invoiceId);
        if (!$invoice) {
            throw new \Exception('Invoice not found');
        }

        if (in_array($invoice['status'], ['paid', 'cancelled'], true)) {
            throw new \Exception('Invoice cannot be approved in current status');
        }

        $this->invoiceModel->update($invoiceId, [
            'status' => 'approved',
            'client_approved_at' => date('Y-m-d H:i:s'),
            'notes' => trim(($invoice['notes'] ?? '') . ($note ? "\n[Client approval] " . $note : '')),
        ]);

        $updated = (new InvoiceService())->getInvoiceById($invoiceId);
        (new NotificationService())->notifyInvoiceClientApproved($this->resolveInvoiceNotifier($invoice), $updated);

        return $updated;
    }

    public function recordPayment(string $token, float $amount, string $method = 'bank_transfer', ?string $reference = null, ?string $note = null): array
    {
        $portal = $this->resolveToken($token);
        if (!$portal) {
            throw new \Exception('Invalid or expired portal link');
        }

        $invoiceId = (int) $portal['invoice_id'];
        $invoice = $this->invoiceModel->find($invoiceId);
        if (!$invoice) {
            throw new \Exception('Invoice not found');
        }

        if ($amount <= 0) {
            throw new \Exception('Payment amount must be greater than zero');
        }

        $this->db->table('invoice_payments')->insert([
            'invoice_id' => $invoiceId,
            'amount' => round($amount, 2),
            'method' => $method,
            'reference' => $reference,
            'note' => $note,
            'paid_at' => date('Y-m-d H:i:s'),
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $totalPaid = (float) $this->db->table('invoice_payments')
            ->selectSum('amount')
            ->where('invoice_id', $invoiceId)
            ->get()
            ->getRowArray()['amount'];

        $invoiceTotal = (float) $invoice['total'];
        $status = $totalPaid >= $invoiceTotal ? 'paid' : 'partially_paid';

        $this->invoiceModel->update($invoiceId, [
            'amount_paid' => $totalPaid,
            'status' => $status,
            'paid_at' => $status === 'paid' ? date('Y-m-d H:i:s') : ($invoice['paid_at'] ?? null),
        ]);

        $updated = (new InvoiceService())->getInvoiceById($invoiceId);
        (new NotificationService())->notifyInvoicePaymentReceived($this->resolveInvoiceNotifier($invoice), $updated, $amount);

        return $updated;
    }

    public function getPaymentsForInvoice(int $invoiceId): array
    {
        return $this->db->table('invoice_payments')
            ->where('invoice_id', $invoiceId)
            ->orderBy('paid_at', 'DESC')
            ->get()
            ->getResultArray();
    }

    public function getOrCreatePortalToken(int $invoiceId): string
    {
        $existing = $this->db->table('invoice_portal_tokens')
            ->where('invoice_id', $invoiceId)
            ->orderBy('id', 'DESC')
            ->get()
            ->getRowArray();

        if ($existing && (empty($existing['expires_at']) || strtotime($existing['expires_at']) >= time())) {
            return $existing['token'];
        }

        return $this->createPortalToken($invoiceId);
    }

    protected function resolveInvoiceNotifier(array $invoice): int
    {
        if (!empty($invoice['created_by'])) {
            return (int) $invoice['created_by'];
        }

        $owner = $this->db->table('organization_members om')
            ->select('om.user_id')
            ->join('roles r', 'r.id = om.role_id')
            ->where('om.organization_id', (int) $invoice['organization_id'])
            ->where('r.slug', 'owner')
            ->get()
            ->getRowArray();

        return (int) ($owner['user_id'] ?? 0);
    }
}
