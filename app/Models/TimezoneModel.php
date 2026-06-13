<?php

namespace App\Models;

use CodeIgniter\Model;

class TimezoneModel extends Model
{
    protected $table = 'timezone';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $protectFields = false;
}
