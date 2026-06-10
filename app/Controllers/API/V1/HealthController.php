<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;

class HealthController extends ResourceController
{
    protected $format = 'json';

    public function index()
    {
        $dbOk = true;
        try {
            db_connect()->query('SELECT 1');
        } catch (\Throwable $e) {
            $dbOk = false;
        }

        return $this->respond([
            'success' => $dbOk,
            'status' => $dbOk ? 'ok' : 'degraded',
            'service' => 'flowtrack-backend',
            'timestamp' => date(DATE_ATOM),
            'version' => \CodeIgniter\CodeIgniter::CI_VERSION,
        ], $dbOk ? 200 : 503);
    }
}
