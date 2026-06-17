<?php

namespace App\Models;

use CodeIgniter\Model;

class InvoiceItemModel extends Model
{
    protected $table            = 'invoice_items';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'invoice_id', 'time_entry_id', 'description', 'quantity', 'unit_price', 'amount', 'created_at',
    ];

    protected bool $allowEmptyInserts = false;
    protected bool $updateOnlyChanged = false;

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = null;

    protected $validationRules = [
        'invoice_id' => 'required|is_natural_no_zero',
        'description' => 'required',
        'quantity' => 'required|decimal',
        'unit_price' => 'required|decimal',
        'amount' => 'required|decimal',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    protected $allowCallbacks = true;
    protected $beforeInsert   = ['calculateAmount'];
    protected $beforeUpdate   = ['calculateAmount'];

    protected function calculateAmount(array $data)
    {
        if (isset($data['data']['quantity']) && isset($data['data']['unit_price'])) {
            $data['data']['amount'] = $data['data']['quantity'] * $data['data']['unit_price'];
        }
        return $data;
    }
}
