<?php

namespace App\Models;

use CodeIgniter\Model;

class ActivityLogModel extends Model
{
    protected $table            = 'activity_logs';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'time_entry_id', 
        'user_id', 
        'app_name', 
        'window_title', 
        'url',
        'category', 
        'duration_seconds', 
        'keyboard_strokes', 
        'mouse_clicks',
        'mouse_movement', 
        'logged_at'
    ];

    protected $useTimestamps = false;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'time_entry_id' => 'required|is_natural_no_zero',
        'user_id' => 'required|is_natural_no_zero',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    protected $allowCallbacks = false;
    protected $beforeInsert   = [];

}
