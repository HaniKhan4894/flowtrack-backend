<?php

namespace App\Models;

use CodeIgniter\Model;

class StateModel extends Model
{
    protected $table = 'states';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $protectFields = false;
}
