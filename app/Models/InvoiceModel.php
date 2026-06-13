<?php

namespace App\Models;

use CodeIgniter\Model;

class InvoiceModel extends Model
{
    protected $table            = 'invoices';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'uuid', 'organization_id', 'invoice_number', 'client_name', 'client_email', 'client_id',
        'project_id', 'status', 'subtotal', 'tax_rate', 'tax_amount', 'total',
        'currency', 'issue_date', 'due_date', 'paid_at', 'notes', 'created_by'
    ];

    protected bool $allowEmptyInserts = false;
    protected bool $updateOnlyChanged = true;

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'organization_id' => 'required|is_natural_no_zero',
        'invoice_number' => 'required|is_unique[invoices.invoice_number,id,{id}]',
        'client_name' => 'required',
        'subtotal' => 'required|decimal',
        'total' => 'required|decimal',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    protected $allowCallbacks = true;
    protected $beforeInsert   = ['generateUUID', 'generateInvoiceNumber'];

    protected function generateUUID(array $data)
    {
        if (!isset($data['data']['uuid'])) {
            $data['data']['uuid'] = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );
        }
        return $data;
    }

    protected function generateInvoiceNumber(array $data)
    {
        if (!isset($data['data']['invoice_number'])) {
            $data['data']['invoice_number'] = 'INV-' . date('Y') . '-' . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
        }
        return $data;
    }
}
