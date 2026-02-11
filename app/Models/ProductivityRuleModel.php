<?php

namespace App\Models;

use CodeIgniter\Model;

class ProductivityRuleModel extends Model
{
    protected $table            = 'productivity_rules';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'rule_type', 'pattern', 'category', 'is_active', 'created_by'
    ];

    protected bool $allowEmptyInserts = false;
    protected bool $updateOnlyChanged = true;

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'organization_id' => 'required|is_natural_no_zero',
        'rule_type' => 'required|in_list[app,url,keyword]',
        'pattern' => 'required',
        'category' => 'required|in_list[productive,unproductive,neutral]',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;
}
