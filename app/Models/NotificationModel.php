<?php

namespace App\Models;

use CodeIgniter\Model;

class NotificationModel extends Model
{
    protected $table            = 'notifications';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields = [
        'user_id', 'type', 'title', 'message', 'data', 'is_read', 'read_at', 'created_at',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = '';

    protected $validationRules = [
        'user_id' => 'required|is_natural_no_zero',
        'type' => 'required|in_list[info,success,warning,error]',
        'title' => 'required|max_length[255]',
        'message' => 'required',
    ];
}
