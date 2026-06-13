<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollTaxTemplateModel extends Model
{
    protected $table            = 'payroll_tax_templates';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'name', 'type', 'rate', 'amount', 'is_active',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
