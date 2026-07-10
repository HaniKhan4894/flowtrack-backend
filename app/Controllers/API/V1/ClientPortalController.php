<?php

namespace App\Controllers\API\V1;

use App\Services\ClientPortalService;
use App\Services\InvoiceService;
use App\Services\ProofOfWorkService;
use App\Services\ScreenshotService;
use CodeIgniter\RESTful\ResourceController;


class ClientPortalController extends ResourceController
{
    protected ClientPortalService $portalService;
    protected ProofOfWorkService $proofService;
    protected ScreenshotService $screenshotService;
    protected $format = 'json';

    public function __construct()
    {
        $this->portalService = new ClientPortalService();
        $this->proofService  = new ProofOfWorkService();
        $this->screenshotService = new ScreenshotService();
    }

    /**
     * GET /api/v1/portal/invoice/:token
     * Must accept $id = null to match ResourceController signature.
     */
    public function show($id = null)
    {
        $token = trim((string) $id);
        if ($token === '') {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        try {
            $invoice = $this->portalService->getInvoiceForPortal($token);
        } catch (\Throwable $e) {
            log_message('error', 'Portal invoice load failed: ' . $e->getMessage());
            return $this->fail('Unable to load invoice portal: ' . $e->getMessage(), 500);
        }

        if (!$invoice) {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        return $this->respond(['success' => true, 'data' => $invoice]);
    }

    /**
     * POST /api/v1/portal/invoice/:token/approve
     */
    public function approve($id = null)
    {
        $token = trim((string) $id);
        if ($token === '') {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        try {
            $note    = $this->request->getJSON(true)['note'] ?? null;
            $invoice = $this->portalService->approveInvoice($token, $note);
            return $this->respond(['success' => true, 'data' => $invoice, 'message' => 'Invoice approved']);
        } catch (\Exception $e) {
            return $this->respond(['success' => false, 'error' => $e->getMessage()], 400);
        }
    }

    /**
     * POST /api/v1/portal/invoice/:token/payment
     */
    public function recordPayment($id = null)
    {
        $token = trim((string) $id);
        if ($token === '') {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        try {
            $body      = $this->request->getJSON(true) ?? [];
            $amount    = (float) ($body['amount']    ?? 0);
            $method    = (string) ($body['method']   ?? 'bank_transfer');
            $reference = $body['reference'] ?? null;
            $note      = $body['note']      ?? null;

            $invoice = $this->portalService->recordPayment($token, $amount, $method, $reference, $note);
            return $this->respond(['success' => true, 'data' => $invoice, 'message' => 'Payment recorded']);
        } catch (\Exception $e) {
            return $this->respond(['success' => false, 'error' => $e->getMessage()], 400);
        }
    }

    /**
     * GET /api/v1/portal/invoice/:token/certificate
     * Returns the signed Verified Work Certificate for this invoice plus a live
     * server-side re-verification of its signature and the ledger state.
     */
    public function certificate($id = null)
    {
        $token = trim((string) $id);
        if ($token === '') {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
        }

        try {
            $portal = $this->portalService->resolveToken($token);
            if (!$portal) {
                return $this->respond(['success' => false, 'error' => 'Invalid or expired portal link'], 404);
            }

            $invoice = (new InvoiceService())->getInvoiceById((int) $portal['invoice_id']);
            if (!$invoice) {
                return $this->respond(['success' => false, 'error' => 'Invoice not found'], 404);
            }

            $proof = $this->proofService->buildForInvoice($invoice, $token);
            $certificate = $proof['certificate'] ?? null;
            if (!$certificate) {
                return $this->respond(['success' => false, 'error' => 'Certificate unavailable'], 404);
            }

            $signatureValid = $this->proofService->verifyCertificateSignature($certificate);

            return $this->respond([
                'success' => true,
                'data' => [
                    'certificate'     => $certificate,
                    'signature_valid' => $signatureValid,
                    'verified_at'     => gmdate('c'),
                ],
            ]);
        } catch (\Throwable $e) {
            log_message('error', 'Certificate build failed: ' . $e->getMessage());
            return $this->fail('Unable to build certificate.', 500);
        }
    }

    /**
     * POST /api/v1/portal/certificate/verify
     * Public, login-free verification of a pasted certificate document. Only
     * checks the cryptographic signature (proves the document is authentic and
     * unaltered since FlowTrack issued it).
     * Body: { certificate: {...} }
     */
    public function verifyCertificate()
    {
        try {
            $body = $this->request->getJSON(true) ?? [];
            $certificate = $body['certificate'] ?? null;
            if (!is_array($certificate)) {
                return $this->respond(['success' => false, 'error' => 'A certificate document is required.'], 400);
            }

            $valid = $this->proofService->verifyCertificateSignature($certificate);

            return $this->respond([
                'success' => true,
                'data' => [
                    'valid'          => $valid,
                    'certificate_id' => $certificate['certificate_id'] ?? null,
                    'organization'   => $certificate['organization'] ?? null,
                    'issued_at'      => $certificate['issued_at'] ?? null,
                    'message'        => $valid
                        ? 'This certificate is authentic and has not been altered.'
                        : 'Signature check failed — this certificate is invalid or was modified.',
                ],
            ]);
        } catch (\Throwable $e) {
            return $this->fail('Unable to verify certificate.', 500);
        }
    }

    /**
     * GET /api/v1/portal/invoice/:token/screenshots/:id/thumbnail
     */
    public function screenshotThumbnail($token = null, $screenshotId = null)
    {
        $token = trim((string) $token);
        if ($token === '' || $screenshotId === null) {
            return $this->respond(['success' => false, 'error' => 'Screenshot not found'], 404);
        }

        $screenshot = $this->proofService->canAccessScreenshot($token, (int) $screenshotId);
        if (!$screenshot) {
            return $this->respond(['success' => false, 'error' => 'Screenshot not found'], 404);
        }

        $relativePath = $this->screenshotService->resolveFilePath($screenshot, true);
        $path         = WRITEPATH . 'uploads/screenshots/' . $relativePath;

        if (!is_file($path)) {
            return $this->respond(['success' => false, 'error' => 'File not found'], 404);
        }

        $mimeType = mime_content_type($path) ?: 'image/jpeg';

        return $this->response
            ->setHeader('Content-Type', $mimeType)
            ->setHeader('Cache-Control', 'private, max-age=3600')
            ->setBody(file_get_contents($path));
    }
}
