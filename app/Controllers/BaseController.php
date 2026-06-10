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

        // Set CORS headers for all responses
        $this->response->setHeader('Access-Control-Allow-Origin', '*');
        $this->response->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        $this->response->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        $this->response->setHeader('Access-Control-Expose-Headers', 'Authorization');

        // Handle preflight OPTIONS request
        if ($this->request->getMethod() === 'options') {
            $this->response->setStatusCode(200);
            exit();
        }
    }
}
