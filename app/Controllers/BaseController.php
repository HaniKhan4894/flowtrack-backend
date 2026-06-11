<?php

namespace App\Controllers;

use CodeIgniter\RESTful\ResourceController;

class BaseController extends ResourceController
{
    protected $format = 'json';

    public function initController(\CodeIgniter\HTTP\RequestInterface $request, \CodeIgniter\HTTP\ResponseInterface $response, \Psr\Log\LoggerInterface $logger)
    {
        parent::initController($request, $response, $logger);
        $requestId = bin2hex(random_bytes(8));
        $this->response->setHeader('X-Request-Id', $requestId);

        // CORS is handled globally by CorsFilter.
    }
}
