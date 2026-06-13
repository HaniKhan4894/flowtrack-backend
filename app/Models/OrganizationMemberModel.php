<?php

namespace App\Models;

use CodeIgniter\Model;

class OrganizationMemberModel extends Model
{
    protected $table            = 'organization_members';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'user_id', 'role_id', 'role', 'hourly_rate', 'joined_at',
        'tracking_enabled', 'screenshots_enabled', 'screenshot_disabled_until',
        'screenshot_disabled_from', 'screenshot_disabled_to',
        'team_id', 'onboarding_state', 'daily_hours_target',
    ];

    protected bool $allowEmptyInserts = false;
    protected bool $updateOnlyChanged = true;

    protected $useTimestamps = false;
    protected $dateFormat    = 'datetime';

    protected $validationRules = [
        'organization_id' => 'required|is_natural_no_zero',
        'user_id' => 'required|is_natural_no_zero',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    protected $allowCallbacks = true;
    protected $beforeInsert   = ['setJoinedAt'];

    protected function setJoinedAt(array $data)
    {
        if (!isset($data['data']['joined_at'])) {
            $data['data']['joined_at'] = date('Y-m-d H:i:s');
        }
        return $data;
    }
}
