<?php

namespace App\Models;

use CodeIgniter\Model;

class SmartNotificationRuleModel extends Model
{
    protected $table = 'smart_notification_rules';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $createdField = 'created_at';
    protected $updatedField = 'updated_at';
    protected $allowedFields = [
        'organization_id', 'name', 'rule_type', 'threshold', 'target_scope',
        'frequency', 'channels', 'config', 'is_active', 'created_by',
    ];
}
