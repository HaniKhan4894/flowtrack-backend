<?php

namespace App\Models;

use CodeIgniter\Model;

class ScreenshotModel extends Model
{
    protected $table            = 'screenshots';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'uuid', 
        'time_entry_id', 
        'user_id', 
        'file_path', 
        'thumbnail_path',
        'is_blurred', 
        'activity_level', 
        'captured_at', 
        'deleted_by_user'
    ];

    protected $useTimestamps = false;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'time_entry_id' => 'required|is_natural_no_zero',
        'user_id' => 'required|is_natural_no_zero',
        'file_path' => 'required',
    ];
    
    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    protected $allowCallbacks = false;
    protected $beforeInsert   = [];

}
