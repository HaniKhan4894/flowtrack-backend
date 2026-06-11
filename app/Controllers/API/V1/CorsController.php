<?php

namespace App\Controllers\API\V1;

use CodeIgniter\Controller;

class CorsController extends Controller
{
    /**
     * Handle all CORS preflight OPTIONS requests.
     * CORS headers are added by the global cors filter (Filters.php globals.after).
     */
    public function preflight(): \CodeIgniter\HTTP\ResponseInterface
    {
        return $this->response
            ->setStatusCode(204)
            ->setBody('');
    }
}
